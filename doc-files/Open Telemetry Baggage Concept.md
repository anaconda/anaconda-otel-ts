# OpenTelemetry Baggage: The Context Carrier

Baggage is OpenTelemetry's mechanism for propagating contextual information across service boundaries throughout a distributed request. Think of it as a "backpack" that travels with your request, carrying important context that all services in the chain can access and use.

## What Baggage Actually Is

Baggage consists of key-value pairs that are automatically propagated through your distributed system. Unlike traces that track the flow of execution, baggage carries **business context** and **metadata** that services need to make informed decisions about how to handle a request.

**Key characteristics:**
- **String-only data**: Both keys and values must be ASCII strings (following W3C Baggage specification)
- **Automatic propagation**: Travels with requests across HTTP, message queues, and other protocols
- **Cross-service accessibility**: Any service in the request chain can read, add, or modify baggage
- **Language agnostic**: Works consistently across different programming languages and frameworks
- **Lightweight**: Designed for small amounts of contextual data

## Practical Use Cases

### 1. **User Context Propagation**
```
Baggage: { "user_id": "12345", "user_tier": "premium", "region": "us-west" }
```
Every service knows who the user is and can customize behavior accordingly—premium users get priority queues, region-specific features are enabled, and logging includes user context.

### 2. **Feature Flag Propagation**
```
Baggage: { "feature_new_checkout": "enabled", "experiment_group": "variant_b" }
```
Ensures consistent feature behavior across all services. If the frontend enables a new checkout flow, all backend services know to use the corresponding new APIs.

### 3. **Request Classification**
```
Baggage: { "request_type": "mobile_app", "client_version": "2.1.4", "priority": "high" }
```
Services can adjust timeouts, choose appropriate algorithms, or route to specific resources based on request characteristics.

### 4. **Compliance and Audit Context**
```
Baggage: { "gdpr_region": "eu", "data_classification": "sensitive", "audit_id": "audit-789" }
```
Critical for ensuring data handling compliance and creating complete audit trails across services.

## Implementation Best Practices

### Important: String-Only Data Types

Baggage only supports string keys and values. If you need to store other data types, convert them to strings first:

```python
# ❌ Won't work - baggage requires strings
baggage.set_baggage("user_id", 12345)        # Number
baggage.set_baggage("is_premium", True)      # Boolean

# ✅ Convert to strings
baggage.set_baggage("user_id", str(user.id))           # Convert number
baggage.set_baggage("is_premium", str(user.is_premium).lower())  # Convert boolean
baggage.set_baggage("features", ",".join(user.features))        # Convert array
```

### Setting Baggage (Early in Request Lifecycle)
```python
# At your API gateway or first service
from opentelemetry import baggage

# Set user context early - all values must be strings
baggage.set_baggage("user_id", str(user.id))
baggage.set_baggage("user_tier", user.subscription_tier)  # Already a string
baggage.set_baggage("tenant_id", str(user.tenant_id))
```

### Reading Baggage (In Downstream Services)
```python
# In any downstream service - convert strings back to desired types
user_id = int(baggage.get_baggage("user_id"))          # Convert to int
user_tier = baggage.get_baggage("user_tier")           # Already a string
is_premium = baggage.get_baggage("is_premium") == "true"  # Convert to bool
features = baggage.get_baggage("features").split(",")  # Convert to array

# Use context to make decisions
if user_tier == "premium":
    return handle_premium_request()
else:
    return handle_standard_request()
```

### Adding Service-Specific Context
```python
# Payment service adds payment context
baggage.set_baggage("payment_method", "credit_card")
baggage.set_baggage("fraud_score", "low")
```

## What NOT to Put in Baggage

### ❌ **Sensitive Information**
Never put passwords, API keys, credit card numbers, or personal identifiers. Baggage can be logged and transmitted in plain text.

### ❌ **Large Data Payloads**
Keep baggage lightweight. Don't put JSON objects, file contents, or large strings. Aim for simple key-value pairs under 1KB total.

### ❌ **Frequently Changing Data**
Avoid data that changes during request processing. Baggage is best for context that remains stable throughout the request lifecycle.

### ❌ **Service Implementation Details**
Don't use baggage for internal service communication that other services shouldn't know about.

## Common Anti-Patterns

**The "Everything Baggage" Anti-Pattern**: Adding every piece of available context. This creates overhead and makes systems harder to reason about.

**The "Secret Baggage" Anti-Pattern**: Using baggage to pass sensitive data because "it's convenient." This creates security vulnerabilities.

**The "Heavy Baggage" Anti-Pattern**: Putting large objects or arrays in baggage, causing network and performance overhead.

**The "Implicit Dependency" Anti-Pattern**: Services that silently depend on specific baggage without documenting it, making systems fragile.

## Monitoring and Debugging Baggage

### View Baggage in Traces
Most tracing tools display baggage alongside trace spans, helping you understand what context was available during request processing.

### Log Baggage Selectively
```python
# Log important baggage for debugging
logger.info("Processing request", extra={
    "user_id": baggage.get_baggage("user_id"),
    "feature_flags": baggage.get_baggage("feature_flags"),
    "trace_id": trace.get_current_span().get_span_context().trace_id
})
```

### Monitor Baggage Size
Track baggage payload size to prevent it from growing too large and impacting performance.

## Integration with Other Signals

**With Traces**: Baggage context automatically appears in trace spans, providing rich context for debugging.

**With Metrics**: Use baggage values as metric labels (carefully—watch cardinality).

**With Logs**: Include relevant baggage in structured logs for better correlation.

## Getting Started with Baggage

1. **Start small**: Begin with 2-3 essential context fields like user ID and tenant ID
2. **Document dependencies**: Clearly document which services expect which baggage keys
3. **Set boundaries**: Establish team guidelines on what belongs in baggage vs. other mechanisms
4. **Monitor overhead**: Track the performance impact of baggage propagation
5. **Review regularly**: Audit baggage usage to remove unused keys and prevent bloat

## When Baggage Is the Right Choice

Use baggage when you need to:
- Share context across service boundaries
- Make consistent decisions across multiple services
- Avoid passing context through APIs explicitly
- Maintain request context through asynchronous operations

Don't use baggage when:
- You only need the context in one service
- The data is sensitive or large
- You have strong service boundaries that shouldn't share context
- Performance overhead outweighs the benefits

**Remember**: Baggage is about sharing context that helps services make better decisions about how to handle requests. Use it judiciously, and it becomes a powerful tool for building context-aware distributed systems.