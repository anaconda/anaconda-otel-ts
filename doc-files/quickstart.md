# Getting Started

This section provides a quick guide to initialize and use the OpenTelemetry Python client for tracing and
metrics using the provided configuration.

## Install the Package

Install the OpenTelemetry Typescript telemetry package file replacing {version} with the actual M.m.p version number...

```
$ npm install https://github.com/anaconda/anaconda-otel-ts/releases/download/v{version}/anaconda-opentelemetry-{version}.tgz
```

For example at the time of this writing the latest version is 0.8.1 so the line to install would be:

```
$ npm install https://github.com/anaconda/anaconda-otel-ts/releases/download/v0.8.1/anaconda-opentelemetry-0.8.1.tgz
```

---

## Example
See the [example.ts](https://github.com/anaconda/anaconda-otel-ts/blob/main/src/example.ts) file to view a full code configuring the package as an example.

## Configuration and ResourceAttributes
There are two sets of values that need to be provided to `initializeTelemetry`: `Configuration` and `ResourceAttributes`
- `Configuration`
  - These are key-value pairs used to configure the OpenTelemetry instrumentation like endpoint, logging_level, auth_token, etc.
- `ResourceAttributes`
  - These are key-value pairs used as telemetry resource attributes. They can be thought of as labels and appear in the telemetry data stream
  - Immutable: These values are fixed once the initializeTelemetry is called. For dynamic attributes, use the attributes passed to the signal event calls (incrementCounter, etc...).
  - These are called resource attributes because they are attached to every piece of telemetry after initialization happens

Configs and ResourceAttributes can be created and passed via their respective objects: `Configuration` and `ResourceAttributes`.

#### Attributes
There is another type of `attributes` that are not passed to `ResourceAttributes` because they can be ephemeral. These are passed when a metric is generated.
```typescript
recordHistogram("test_histogram", 50.0, {"attribute": "value"})
```

## Prepare the Configuration Object
The first call you make to get started with telemetry is the `initializeTelemetry` function. This requires a `Configuration` object be created. The bare minimal is:
```typescript
const config = new Configuration(new URL("http://localhost:4318/v1/metrics"))
```
This class has a number of setter methods for setting various configuration options. See documentation below for details. For each configuration there is a corresponding environment variable. The environment variable names are listed in the `Configuration` class remarks.

### Configuration Default Endpoint
A default endpoint must be passed either to the constructor. It is the only value in the configuration that must be specified. The usage of TLS is derived from the scheme specified in the endpoint, as well as the OpenTelemetry export protocol (HTTP or gRPC). Using an unallowed scheme will raise an error. The allowed schemes are:
- https (HTTP protocol, TLS enabled)
- http (HTTP protocol, TLS disabled)
- grpcs (gRPC protocol, TLS enabled)
- grpc (gRPC protocol, TLS disabled)

For debugging purposes the enpoint(s) may be set to "console:" in configuration, or use the ATEL_USE_CONSOLE=1 environment variable to bypass sending to a collector and instead dumping to the console. This flag is also exposed in the `Configuration` class via the `setUseConsoleOutput` method.

### Metric and Tracing Configuration
If your use case requires different schemes/TLS settings, auth tokens, or CA certs for different signal types: you can pass varying auth token and cert file parameters to the endpoint setter. The function signature is:

`Configuration.setTraceEndpoint(endpoint: URL, authToken?: string | undefined, certFile?: string | undefined): Configuration`
```typescript
const config = new Configuration(new URL("http://localhost:4318/v1/metrics"), "aOt5Y7...", "./testcert.crt")
```

Please note that if no specific signal configurations are applied all signal exporters will use the configurations applied to the default.

## Prepare the ResourceAttributes Object
The `initializeTelemetry` function also requires a `ResourceAttributes` object. Configure this class with attributes that belong to ALL telemetry generated per end-user session. For example if user `userxyz123` starts an application instrumenting with this package then ALL telemetry generated would have user_id `userxyz123` in common, so it is appropriate to be set in this class.

Attributes that are unique per telemetry call, like a variable in code that changes conditionally, should be passed to the attributes parameter of telemetry generation methods (see [recording telemetry](#recording-telemetry), [`traceBlock`](#tracing-with-context-manager), [`recordHistorgram`](#record-metrics), etc.).

The simplest configuration requires a service_name and service_version and would look like:
```typescript
const serviceName: string = "service-a"
const serviceVersion: string = "v1"
const attributes = new ResourceAttributes(serviceName, serviceVersion)
```
There are more fields than this which are documented in the API section and in the class docstring. The class also has a `setAttributes()` method which can create values under any key including dynamic keys unique to a specific application or runtime.

---

## Initialize Telemetry
The telemetry system is designed as singleton objects and only need to be initialzed once per process. Calling
`initializeTelemetry` a second time will silently return with no errors and with no undesireable behaviors. It also will not change anything from the initial call.

Use the `initializeTelemetry` function to initialize exporters (No SSL in this example):

```typescript
import {
    Configuration,
    decrementCounter,
    incrementCounter,
    initializeTelemetry,
    reinitializeTelemetry,
    recordHistogram,
    ResourceAttributes,
    traceBlock,
    ASpan
} from "./index"

const config = new Configuration(new URL("example.com:4317/v1/metrics"))
const attributes = new ResourceAttributes("service-a", "v1")
try {
  initializeTelemetry(
      config=config,
      attributes=attributes
  )
} catch {
  # Handle error in the application.
}
```

or for SSL and Authentication Token support, specify those parameters to either the `Configuration` constructor or endpoint setter for metrics and logging:

```typescript
import {
    Configuration,
    decrementCounter,
    incrementCounter,
    initializeTelemetry,
    reinitializeTelemetry,
    recordHistogram,
    ResourceAttributes,
    traceBlock,
    ASpan
} from "./index"

const config = new Configuration(new URL("example.com:4317/v1/metrics"))
    .setMetricsEndpoint("example.com:4317/v1/metrics", "aOt5Y7...", undefined)
const attributes = new ResourceAttributes("service-a", "v1")
try {
  initializeTelemetry(
      config,
      attributes
  )
} catch {
  # Handle error in the application.
}
```


### Optional Signal Streams
You may optionally restrict which signal types to enable (only metrics are enabled by default). The try catch is omitted here:

```typescript
initializeTelemetry(
    config,
    attributes,
    ["metrics"]
)
```
Passing `[]` for `signalTypes` will not initialize any metrics. This is a quick way to disable all metrics.


### Optional Session Entropy
You may also optionally pass an entropy_param string which is used to create a session_id for all telemetry generated by a particular session. The session_id is the result of a hash which needs uniqueness to isolate sessions, hence the entropy parameter. The try catch was ommitted here:

```typescript
const config = new Configuration(new URL("example.com:4317/v1/metrics"))
    .setTracingSessionEntropy("randomnessString")
const attributes = new ResourceAttributes("service-a", "v1")
try {
  initializeTelemetry(
      config,
      attributes
  )
} catch {
  # Handle error in the application.
}
```

By default, the session_id will depend on a call to time.time(), which happens when `initializeTelemetry` is called. If a single session of your application is liable to perform work in multiple processes, this entropy_param can be passed to each process and into the `initializeTelemetry` call ensuring a common session_id among them.

This is useful because session_id can be used by a backend to tie all user actions from a particular session together chronologically (timestamp is on traces). It is a way to group user journeys.

---

# Recording Telemetry
Below are more in depth examples on recording telemetry once initialization is complete. These functions contain the `attributes` parameter. This is where call specific data can be passed as attributes to pieces of telemetry.

---

## Record Metrics
Metrics are usually counters or a interesting value that changes with time in your application. The types of metric objects that can be used in this package are:
- **UpDownCounter**: A cumulative sum. This type can be used with functions `incrementCounter` and `decrementCounter`. This is the default type created.
- **Histogram**: This metric should be used to create distributions of values rather than sums. Examples: current number of open network connections, latency. Use `recordHistogram` with this type.

### Histogram

```typescript
recordHistogram({name: "request_duration_ms", value: 123.4, attributes: {"route": "/home"}})
```

### Counter (Increment)

```typescript
incrementCounter({name: "active_sessions", by: 1, attributes: {"region": "us-east"}})
```

### Counter (Decrement)
Restricted to type `simple_up_down_counter`.

```typescript
decrementCounter({name: "active_sessions", by: 1, attributes: {"region": "us-east"}})
```

### Naming Metrics
Metrics named with improper characters make the Otel metrics SDK throw an exception, so we have restricted metric names to match the following Python regex:

`^[A-Za-z][A-Za-z_0-9]+$`

Metric names must start with a letter and then only contain alphanumeric or underscore characters.

---

## Tracing with Context Manager

<span style="color: red; background-color: yellow; font-style: italic; font-weight: bold; font-size: large">
Note: At the time of this writing there is not a public tracing endpoint for traces collection.
</span>


Tracing allow the application to trace (or follow) a user workflow. This is accomplished by creating _one or
more_ root contexts with [`createRootTraceContext`](../functions/index.createRootTraceContext.html). If
continuing, the trace context from another process use the [`CarrierMap`](../types/index.CarrierMap.html)
information passes via messaging or HTTP headers in the call to the create a root context.
You only need to add carriers to the root, all children trace contexts inherit the information. You can
retrieve the `CarrierMap` from any [`TraceContext`](../interfaces/index.TraceContext.html) object for use
across process or server boundaries. See the
[API documentation](../modules/index.html) for more details.

```typescript
// This creates a root context with name "root-context" and attributes foo="bar"...
let rootContext = createRootTraceContext({name: 'root-context', attributes: {foo:'bar'}})
```

Child (or nested) contexts are created from the root context with
[`rootContext.createchildtracecontext`](../interfaces/index.TraceContext.html#createchildtracecontext-1).
More attributes can be added. The child will inherit the parent attributes.

```typescript
// This creates a child context with name "child-context" and attributes meaning="42"...
let childContext = rootContext.createchildtracecontext({name: 'child-context', attributes: {meaning: '42'}})
```

The `end()` method ___MUST___ be called in order for the telementry to be sent. There are no destructors in Typescript
so this is _absolutely required_. Think of a child context nested in a root context, this also implies the child's
`end()` method must be called before the parents `end()` method is called. Calling in a differnt order may confuse
the tracing telemetry.

### Naming Traces
While metrics have enforced regex rules, trace names have more permissive options. Spaces and non-alphanumeric
characters are allowed.

---

With telemetry initialized, your application will now export traces and metrics to the configured OpenTelemetry
Collector endpoints.

## Notes on Resource Attributes
No particular attribute values are required for the class from clients besides `serviceName` and `serviceVersion` at
this time. There are two distinct patterns with which attributes are configured. In an OpenTelemetry payload, both
patterns end up in its resource attributes.

### Common Attributes
These are documented in the ResourceAttributes class string and are referred to as common because it is likely that
most if not all clients will share them. They are part of the minimum telemetry schema for unified telemetry.

`serviceName`, `serviceVersion`, `osType`, `osVersion`,`pythonVersion`, `hostname`, `platform`, `environment`,
`userId`, `clientSdkVersion`, `schemaVersion`, `sessionId`

- `userId` will not be found with the other "resources" in the OTel output. Instead it it added to each event's
  attributes. This is required since a session may transition from anonymous users to real users and "resources"
  are fixed at OTel initialization.
- You will not see `sessionId` in the ResourceAttributes class even though it is a common attribute
- This is because it is set by this package after the client is finished initializing
- It is a result of hashing the SESSION_ENTROPY_VALUE_NAME value in the environment.

A configuration of this class using all available initialization parameters would look like:
```typescript
const attrs = new ResourceAttributes(
  "test_service",  # service_name requires a user-supplied value, not a keyword arg
  "v1",  # service_version requires a user-supplied value, not a keyword arg
  "Darwin",
  "24.2.0",
  "3.13.2",
  "Users-MBP",
  // rest of attributes ...
)
```

We have implemented Python methods from `platform` and `socket` to gather osType, osVersion, pythonVersion, and
hostname by default if they are not provided. This is just an opportunity to provide your own values.

- Example: if a server on AWS should have a hostname indicating it is part of the cloud provider

### Dynamic Attributes
Dynamic attributes can be any key and any value. This is where a client can create telemetry attributes specific to their needs. In code they can be configured by using `setAttributes`. Dynamic attributes are sent to a dictionary called `parameters`.

Passing kwargs to the ResourceAttributes set_attributes method
```typescript
const res = new ResourceAttributes("test_aotel", "1.0.0").setAttributes({foo: "test"})
```

- If you set keys for any of the class parameters the most recent set operation will overwrite the pre-existing value
- Setting parameters directly is not allowed, it is modified by adding keys/values pairs with setAttributes.
