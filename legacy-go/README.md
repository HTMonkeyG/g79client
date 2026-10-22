# legacy-go

这里是原始的 Go 实现，已整体移动到本目录，供对照参考。当前项目的主实现是仓库根目录的 JavaScript 版本：

- 入口：`../main.js`
- 源码：`../src/`
- 测试：`npm test`

如需单独构建/运行 Go 版本：

```bash
cd legacy-go
go build ./...
go run ./example/main.go
```

注意：`legacy-go/example` 中的示例包含硬编码 Cookie，可能已经失效。
