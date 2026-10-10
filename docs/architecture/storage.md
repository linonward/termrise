# Storage

## Storage Adapter

`packages/storage` 提供 `ObjectStorage` 接口（`types.ts`）与 R2、Fake 适配器；`apps/api/src/storage.ts`（`POST /api/uploads`）和 admin 脚本（`apps/web/scripts/script-storage.ts`）各自按 env 选择适配器。业务代码只依赖这个接口，不直接使用 S3 SDK。

```text
createUploadUrl()     签名 PUT URL（浏览器直传）
createDownloadUrl()   签名 GET URL（播放或下载）
head()                读取对象元数据，不存在时返回 null
getObject()           读取整个对象（只用于小对象）
putObject()           服务端写入 Buffer，或流式写入 ReadableStream
delete()              删除对象
list()                列出某个前缀下的全部 key（分页读完），用于删除账号
```

实现：

| 实现                | 文件                                    | 使用场景                                                                                       |
| ------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `createR2Storage`   | `packages/storage/src/adapters/r2.ts`   | Production、Preview、本地开发（`STORAGE_PROVIDER=r2`，默认）                                   |
| `createFakeStorage` | `packages/storage/src/adapters/fake.ts` | 单元测试（内存）和 E2E（`STORAGE_PROVIDER=fake`；web 存为文件目录，`apps/api` 只签名，用内存） |

- `apps/api` 用 `apiStorage(env)`，按 `STORAGE_PROVIDER` 选择实现。
- web 在 Production 禁止 `fake`（`packages/config/src/env.ts` 校验），`fake` 时必须设置 `FAKE_STORAGE_DIR`。`apps/api` 的 `fake` 一律需要 `ALLOW_FAKE_PROVIDERS=1`（见 environment.md 的 API Bindings）。
- AWS SDK v3 在 Workers（`nodejs_compat`）上签名可用：S07 在 `wrangler dev` 上对本地 SeaweedFS 验证过，签名 URL 上传成功，`Content-Type` 不一致时返回 403。
- R2 使用 S3 兼容 API：endpoint 为 `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`（设置 `R2_ENDPOINT` 时用它，见 [Local Storage](#local-storage)），path-style，region `auto`。
- 签名 PUT URL 不带 checksum 参数（签名用的 client 设置 `requestChecksumCalculation: "WHEN_REQUIRED"`）。AWS SDK 默认在 URL 中写入空 body 的 CRC32，校验 checksum 的服务（SeaweedFS、AWS S3）会拒绝上传。服务端 `putObject` 仍由 SDK 计算 checksum。
- 普通测试只用内存实现或离线签名（`packages/storage/src/adapters/r2.test.ts`），不需要 R2 密钥。
- 流式写入必须传 `contentLength`：R2 拒绝没有长度的流式上传。

---

## Upload Flow

```text
Browser
↓
POST /api/uploads { contentType, size, extension }
↓
UploadService 校验 → 签名 PUT URL + objectKey
↓
Browser PUT → R2
↓
Browser 保存 objectKey
↓
业务请求（例如付费操作）提交 objectKey
↓
服务端 verifyUpload() 校验归属和实际对象
```

禁止：

```text
Browser
↓
Next.js Server
↓
R2
```

文件不经过我们的服务端。客户端用 `uploadImage()`（`packages/storage/src/upload-client.ts`）完成前四步：先在浏览器校验，再请求签名 URL，再用 XHR PUT（为了上传进度）。starter 的页面还没有调用 `uploadImage()`。

上传限制（`packages/storage/src/upload-rules.ts`，浏览器和服务端共用）：

```text
jpg / jpeg → image/jpeg
png        → image/png
webp       → image/webp

max 10 MB（MAX_UPLOAD_BYTES）
```

扩展名与 `contentType` 必须匹配；大小必须为正整数且不超过上限。

Object key：

```text
uploads/{userId}/{uuid}.{ext}
```

`ext` 为小写扩展名。

必须验证：

```text
MIME（签名时锁定 Content-Type）

extension

size（签名前校验声明值；使用前 HEAD 校验实际值）

ownership（key 必须是 uploads/{currentUser.id}/{uuid}.{ext}）
```

签名 URL 有效期：5 分钟。

`POST /api/uploads` 响应：

```json
{
  "objectKey": "uploads/{userId}/{uuid}.png",
  "uploadUrl": "https://…",
  "headers": { "Content-Type": "image/png" },
  "expiresAt": "2026-01-01T10:05:00.000Z"
}
```

- 浏览器 PUT 时必须带上 `headers`。签名包含 `Content-Type` 和 `Content-Length`，上传时任一不一致，R2 返回 403。
- 声明值不合规返回 `400 INVALID_INPUT`。
- 限流：每个用户每分钟 20 次（`upload:{userId}`）。

使用 objectKey 前，服务端调用 `UploadService.verifyUpload(userId, objectKey)`（`packages/storage/src/upload-service.ts`）：

- key 不属于当前用户、格式不对或对象不存在：一律返回 `404 UPLOAD_NOT_FOUND`，不泄露他人对象是否存在。
- 实际类型或大小不合规：返回 `400 INVALID_INPUT`。
- 付费操作要在扣费之前调用它。starter 已有该方法和单元测试，但还没有业务使用上传：新产品在自己的付费操作中接入。

R2 bucket 需要配置 CORS 允许站点域名 PUT（`infra/r2/`）。

`uploads/` 下没有被引用的孤儿文件当前不清理；需要时用 R2 lifecycle rule 处理。删除账号时删除该用户的 `uploads/{userId}/`，见 [data-model.md](data-model.md#user)。

---

## Download URLs

对象不公开。读取时由服务端签发有时限的 GET URL：

- `expiresInSeconds`：URL 的有效期。常用 1 小时。
- `downloadFilename`：设置后响应头为 `Content-Disposition: attachment; filename="…"`，浏览器下载而不是打开。
- `cacheSeconds`：在这个窗口内返回同一个 URL（签名时间取窗口开始），浏览器缓存可以命中。URL 的实际有效期为 `expiresInSeconds + cacheSeconds`，所以每次返回后仍至少有效 `expiresInSeconds`。

先校验归属，再签发 URL。starter 中目前没有调用 `createDownloadUrl()` 的页面或路由。

---

## Local Storage

本地开发默认用 SeaweedFS（`docker-compose.yml` 的 `storage` 服务）代替 R2，不需要 Cloudflare 密钥：

```bash
docker compose up -d storage
```

`apps/web/.env.local`：

```text
R2_ACCOUNT_ID=local
R2_ACCESS_KEY_ID=local
R2_SECRET_ACCESS_KEY=local-secret
R2_BUCKET=app-dev
R2_ENDPOINT=http://localhost:8333
```

- 容器启动时创建 `app-dev` bucket，凭证 `local` / `local-secret` 只用于本地。数据存放在 Docker volume `storage-data`。
- CORS 由启动参数 `-s3.allowedOrigins=http://localhost:3000` 设置，允许所有方法和请求头，比 `infra/r2/cors-dev.json` 宽松。验证 CORS 规则时连 dev bucket。
- 签名 PUT 与 R2 一样校验 `Content-Type` 和 `Content-Length`，不一致返回 403。
- 需要验证真实 R2 的行为时，去掉 `R2_ENDPOINT`，填写 dev bucket（`app-dev`）的密钥。
- 不用 MinIO：官方在 2025 年 10 月停止发布 Docker 镜像，2026 年 4 月归档开源仓库。

---

## E2E

E2E 使用 `STORAGE_PROVIDER=fake`：签名 URL 指向 `https://fake-storage.test/{key}`，对象以文件存放在 `FAKE_STORAGE_DIR`。Next.js 服务端与 Playwright 进程通过这个目录共享对象，浏览器对签名 URL 的 PUT / GET 由 Playwright 拦截（`apps/web/tests/setup/fake-storage.ts`）。
