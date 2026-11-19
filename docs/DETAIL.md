# 插件自动更新

给 Desktop 版 DSH 补上「插件自动更新」：按计划检查 profile 里已安装的插件，把兼容的新版本**原地**装好，重启 DSH 后生效。

## 它做什么

1. 启动后 60 秒做第一次检查，之后每 12 小时一次（都可配置）。
2. 向插件管理器要清单：只处理满足全部条件的 bundle —— 由 npm registry 安装（`update: 'registry'`）、当前已启用、没有加载错误、不是它自己、不在排除名单里。
3. 对每个候选读一次 npm 版本列表，取**最新的、兼容当前 DSH 的、非预发布**版本（可配置放开预发布）。
4. 调插件管理器的 `updateBundle(name, version)` 完成替换：兼容性检查、profile 写锁、失败回滚都由管理器负责。
5. 写一行 NDJSON 日志，并在真的更新了东西时发一条 macOS 通知。

## 为什么不做成界面

更新的最终状态永远是「装好了，等你重启」——DSH 是 Desktop 应用，进程生命周期归桌面外壳所有，插件无权替它重启。所以这里把可见性放在三处：插件页里的这一行和详情页、系统通知、以及日志文件。

## 配置

写在 profile 的 `cordis.patch.yml` 里这一行的 `config` 下，字段全部可选：

| 字段 | 默认 | 含义 |
|---|---|---|
| `enabled` | `true` | 关掉后不排期，也不做任何检查 |
| `autoInstall` | `true` | `false` 时只检查并在日志里记下可用版本，不安装 |
| `allowPrerelease` | `false` | 是否接受预发布版本 |
| `intervalHours` | `12` | 检查间隔 |
| `initialDelaySeconds` | `60` | 启动后首次检查的延迟 |
| `exclude` | `[]` | 额外排除的包名 |
| `notify` | `true` | 更新后发 macOS 通知 |

例：

```yaml
- id: plugin-autoupdate
  name: 'dsh-plugin-autoupdate'
  config:
    intervalHours: 24
    exclude: ['dshmarket']
```

## 日志

`~/.dsh/profiles/desktop/.plugin-autoupdate/log.ndjson`（跟随 `DSH_PROFILE_DIR`）。每行一个事件：`armed`、`sweep`、`disabled`、`sweep-failed`。`sweep` 里有 `checked`、`changed` 和每个包的 `skipped` 原因。

## 已知边界

- 市场（`dshmarket`）不在这里更新：它自己带原地更新，而且它属于插件管理组件，管理器不允许替换。默认建议留在排除名单里。
- Git / tarball / 本地目录安装的插件没有版本列表，不会被处理。
- 只更新已启用的 bundle；被停用的要等你启用后下一轮才会检查。
- 新代码需要重启 DSH 才会加载；不重启时运行中的仍是旧代码。
- 更新失败时管理器会回滚到原版本，失败信息写进日志。
- 没有任何界面按钮：开关就是插件页里这一行的启用/停用，参数就是上面那张表。
