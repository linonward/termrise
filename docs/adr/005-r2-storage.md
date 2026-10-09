# ADR-005: Object Storage — Cloudflare R2

- Status: Accepted
- Date: 2026-10-05

## Context

要存用户上传的文件，和服务端生成的结果文件（例如 AI 生成的图片或视频）。结果文件会被反复查看和下载。AI Provider 的结果 URL 通常会过期，不能长期依赖。

## Decision

- 使用 Cloudflare R2（S3 兼容 API），每个环境一个私有 bucket。
- 浏览器通过签名 PUT URL 直传文件；查看和下载使用有时限的签名 GET URL。
- 服务端生成的结果以流式方式写入 R2（`putObject` 支持流）。
- 业务代码只依赖 `ObjectStorage` 接口，测试使用 FakeStorage。

Bucket、CORS、密钥见 [Storage](../architecture/overview.md#storage)；流程见 [Upload Flow](../architecture/storage.md#upload-flow)。

## Alternatives

- **AWS S3**：下载按流量收费，文件被查看越多成本越高。
- **Vercel Blob**：同样有流量费用，且与 Vercel 套餐绑定。
- **直接使用 Provider 的结果 URL**：通常在几小时内过期。
- **公开 bucket**：任何人拿到 key 就能访问他人文件。

## Consequences

- R2 下载免流量费，存储费用在小规模时可以忽略。
- 本地开发默认用 SeaweedFS（S3 兼容），通过 `R2_ENDPOINT` 连接；需要验证 R2 行为时连 dev bucket。不用 MinIO：官方已停止发布 Docker 镜像并归档开源仓库（2026-10-08 修订，原为“本地开发连真实的 dev bucket”）。
- 服务端复制大文件的耗时受 Vercel 函数时长限制，接入时要实测。
