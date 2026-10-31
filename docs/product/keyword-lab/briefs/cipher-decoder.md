# 选词简报：cipher decoder

选定日期：2026-10-31 · 轮次文件：research/keyword-research-20261031-convertcase.csv · 词源：ranked:convertcase.net

## 结论

需求稳定、首页几乎没有专门做这个的大站、说法极多（107 个变种）：一个能自动识别密码类型、把解码步骤讲清楚的工具，有机会用一个站吃下一整片长尾。

## 数据（来源：DataForSEO，2026-10-31）

| 项                       | 值                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 美国月搜索量             | 14,800                                                                                                      |
| KD                       | 14                                                                                                          |
| CPC                      | $2.00（ranked_keywords）；$0.69（keyword_suggestions 拉主词时）。两个接口不一致，按低的估收入               |
| 月搜 ≥ 50 的变种数（S1） | 107（本轮最高）                                                                                             |
| 趋势                     | 12 个月波动比 1.88；12 个月同比 -8%；最近 3 个月对比去年同期 -16%，基线 converter -10%，相对 -7%（H6 通过） |
| 前 10 强对手数（H5）     | 0                                                                                                           |
| 前 10 内页数（S3）       | 7 / 8（只有 cipherdecipher.com 是首页）                                                                     |

## 同义说法（4.5）

DataForSEO 把下面几种说法算成同一组数据（同搜索量、同趋势），KD 不同：

| 说法                    | 月搜   | KD  |
| ----------------------- | ------ | --- |
| cipher decoder          | 14,800 | 14  |
| decoder cipher          | 14,800 | 14  |
| ciphertext decoder      | 14,800 | 14  |
| caesar cipher decoder   | 14,800 | 34  |
| caesar cipher solver    | 14,800 | 31  |
| vigenere cipher decoder | 4,400  | 25  |
| decoder caesar cipher   | 2,400  | 8   |

caesar 这一组 KD 超过 29，不当主词，做成子页或首页里的一个模式。

## 联想词（4.6，用作关键词分析的种子）

- cipher decoder with key / with keyword
- cipher decoder vigenere / atbash / numbers / alphabet / ascii
- cipher decoder image / audio
- cipher decoder automatic / auto / ai
- cipher decoder and encoder
- cipher decoder gravity falls / mistfall（游戏和动画里的解谜）

完整列表：`research/raw/suggest/suggest-cipher-decoder-20261031.txt`、`research/raw/variants-cipher-decoder-20261031.csv`。

## 合规和变现

- 变现方式：广告；付费功能可以是批量解码、自动识别密码类型、图片里的密文识别。
- 合规判断和依据：经典密码（Caesar、Vigenère、Atbash 等）是公开的教学和解谜内容。gravity falls、mistfall 是粉丝解谜搜索，不涉及侵权内容（不搬原作图片和文本）。不做破解现代加密、密码哈希或别人账号的功能。

## 前 10 名（4.4）

| 排名 | 域名                              | 首页/内页 | 是否专门页面         | 强对手 |
| ---- | --------------------------------- | --------- | -------------------- | ------ |
| 1    | reddit.com（r/cryptography 帖子） | 内页      | 否                   | 否     |
| 2    | inventivehq.com（ETV 12,813）     | 内页      | 是（Caesar）         | 否     |
| 3    | inventivehq.com                   | 内页      | 是（Substitution）   | 否     |
| 4    | cipherdecipher.com（ETV 419）     | 首页      | 是                   | 否     |
| 5    | reddit.com（r/Cipher 帖子）       | 内页      | 否                   | 否     |
| 6    | play.google.com（应用）           | 内页      | 否                   | 否     |
| 7    | cipherchronicle.com（ETV 132）    | 内页      | 是                   | 否     |
| 8    | braingle.com（ETV 18,320）        | 内页      | 是（Keyword cipher） | 否     |

两个 Reddit 帖子和一个应用占了前 6 名里的 3 个位置：搜的人没找到好用的网页工具。

## AI 改造点（S4）

粘贴一段密文，自动判断是哪种密码、给出最可能的明文，并一步一步解释怎么解出来的。对手都要求用户先知道是哪种密码。

## 域名

| 域名               | 状态                                  |
| ------------------ | ------------------------------------- |
| cipherdecoder.com  | 已注册（2026-06-15）                  |
| decodecipher.com   | 已注册                                |
| ciphersolver.com   | 已注册                                |
| cipher-decoder.com | RDAP 查不到，可能没注册，去注册商确认 |
| cipherdecoder.net  | 同上                                  |
| cipherdecoder.app  | 同上                                  |

## 交给建站时要注意

- CPC 两个接口差 3 倍，收入按 $0.69 估。
- cipherdecoder.com 2026-06 刚被注册，可能有人在做同一个词，上线前再看一次前 10 名。
- 没有确认的事：可用域名要在注册商确认；`suggest` 里的 mistfall 是什么还没查。
