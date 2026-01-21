# CHANGELOG
We [keep a changelog.](http://keepachangelog.com/)

## [v0.9.0] (2026-01-21) - [Features and Bug Fixes] Beta 2 Release

### Added

- Feature: to better handle multi-process/multi-system tracing carrier for distributed applications.
- Feature: Added a shim to the exporter code to allow changing then endpoint for transitions from anonymous to a logged in user (seperate endpoints).
- Feature: Moved "user.id" data from resources to attributes also for a anonymous to user transition (resources are fixed at app start)
- Documentation: Added a description of [authentication](https://anaconda.github.io/anaconda-otel-ts/docs/documents/quickstart.html#authentication) in the documentation.
- Unit Tests: Added more test cases around the previous changes.
- Github Process: Added coverage and documentation to github.io triggered by a merge to main.

### Deprecated

- NA

### Removed

- `reinitialization()` - renamed to [changeSignalEndpoint(...)](https://anaconda.github.io/anaconda-otel-ts/docs/functions/index.changeSignalConnection.html).

### Fixed

- Improved documentation for getting started and API DocStrings including fixing broken URLs.
- Renovate driven dependency updates (excluded from PR list).

### Security

- NA

### Tickets Closed

- NA (No public generated issues)

### Pull Requests Merged
```
2025-09-24 #25 [Fix] Add npm publish, remove org @anaconda in package name.
2025-10-20 #30 [Fix] Update quickstart.md with more precise information.
2025-10-24 #34 [feat] metric and trace shims exporters w/ tests.
2025-10-29 #35 Multi endpoint removal
2025-10-30 #37 [docs] Added merge doc deploy workflow, and README.md.
2025-10-30 #44 [fix] Deploy from PR branch fails (permissions), try push to main.
2025-10-30 #45 [fix] Deploy was skipped due to an if in the workflow file.
2025-10-30 #46 [fix] URLs in readme were wrong.
2025-10-30 #36 [Feat] Change reinitialize to changeSignalEndpoint
2025-11-07 #47 Separate resources (fixed) from attributes (can change)
2025-11-18 #49 Tracing context
2025-11-19 #51 Auth documentation
2025-12-02 #55 Change 'parameter' attributes back to a resource instead of per event attributes.
2025-12-18 #58 adding carrier integration test
```

# Previous Releases

## [v0.8.1] (2025-09-23) - [Initial Release] Beta 1 Release
