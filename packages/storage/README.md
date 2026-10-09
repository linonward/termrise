# @repo/storage

`ObjectStorage` 接口、R2 与 Fake 适配器、预签名上传。

| 子路径                         | 内容                                                |
| ------------------------------ | --------------------------------------------------- |
| `@repo/storage/types`          | `ObjectStorage` 接口                                |
| `@repo/storage/upload-service` | `createUploadService()`：签发上传 URL、校验上传结果 |
| `@repo/storage/upload-rules`   | 允许的文件类型与大小上限                            |
| `@repo/storage/upload-client`  | 浏览器端 `uploadImage()`                            |
| `@repo/storage/adapters/r2`    | R2（S3 兼容）适配器，本地开发连 SeaweedFS           |
| `@repo/storage/adapters/fake`  | 测试用 FakeStorage                                  |

见 [storage.md](../../docs/architecture/storage.md)。

包的规则（子路径导入、不读取 env、不依赖 `apps/*`）见 [Monorepo](../../docs/architecture/overview.md#monorepo)。
