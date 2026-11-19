# dsh-plugin-autoupdate

Scheduled in-place updates for profile plugins on DSH Desktop, through the official
`pluginManager` service. Updates land on disk automatically; restart DSH to load them.

- First check 60 s after start, then every 12 h (configurable).
- Only enabled, registry-installed, loadable bundles; never itself.
- Picks the newest compatible, non-prerelease version unless `allowPrerelease` is set.
- Logs to `<profile>/.plugin-autoupdate/log.ndjson` and notifies on macOS.

See [docs/DETAIL.md](docs/DETAIL.md) for configuration and known limits.
