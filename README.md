# dsh-plugin-autoupdate

定时检查已安装的 profile 插件，并通过官方 `pluginManager` 服务把兼容的新版本原地装上；更新自动保存到磁盘，重启 DSH 后加载新代码。

## 功能

- 启动后 60 秒首次检查，之后每 12 小时一次（可配置）。
- 仅更新已启用、从注册表安装、可加载的插件包；**绝不更新自身**（避免运行中把自己卸载）。
- 默认选择最新的兼容非预发布版本，除非设置 `allowPrerelease`。
- 记录日志到 `<profile>/.plugin-autoupdate/log.ndjson`，并在 macOS 上发出通知。
- 可配置排除列表（默认已排除 `dshmarket`，避免与市场的自更新冲突）。

## 配置

配置项全部写在插件行的 `config` 中，常用项：

| 项 | 默认 | 说明 |
|---|---|---|
| `intervalHours` | `12` | 检查间隔（小时） |
| `autoInstall` | `true` | 是否自动安装兼容更新 |
| `allowPrerelease` | `false` | 是否允许预发布版本 |
| `exclude` | `['dshmarket']` | 额外排除的包名 |
| `notify` | `true` | 更新后发 macOS 通知 |

## 安装

在 DSH 插件页通过本地目录安装，或通过插件市场索引安装本包。

详细配置与已知限制见 [docs/DETAIL.md](docs/DETAIL.md)。

## 许可

MIT
