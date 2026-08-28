# Cloudflare BiliParser API

基于 Cloudflare Workers 部署的 bilibili 视频直链、视频信息、直播流、番剧、弹幕等解析服务。
使用 Edge Cache (边缘节点缓存) + Workers KV 二级缓存,根据视频时长动态计算缓存时间,最大化利用缓存提高解析速度。
内置请求限流,并支持根据请求地区自动切换 CDN,支持 VRChat (VizVid / ProTV)。

![MIT](https://img.shields.io/badge/-VRCHAT%20Support-blue?style=for-the-badge&logo=vrchat) ![MIT](https://img.shields.io/badge/-Cloudflare%20Workers-orange?style=for-the-badge&logo=cloudflare&logoColor=white) ![TS](https://img.shields.io/badge/-Typescript-blue?style=for-the-badge&logo=typescript&logoColor=white) ![LIC](https://img.shields.io/badge/LICENSE-MIT-green?style=for-the-badge)

## Try

> [!IMPORTANT]
> `bili.nekocha.top`为测试站点，不保证随时有效，请勿频繁请求或者用于批量爬虫

- 信息: [https://bili.nekocha.top](https://bili.nekocha.top)
- 视频播放: [https://bili.nekocha.top/video/BV1UT42167xb](https://bili.nekocha.top/video/BV1UT42167xb)
- 视频信息: [https://bili.nekocha.top/video/BV1UT42167xb?type=json](https://bili.nekocha.top/video/BV1UT42167xb?type=json)
- 直播播放: [https://bili.nekocha.top/live/5055636](https://bili.nekocha.top/live/5055636)
- 直播信息: [https://bili.nekocha.top/live/5055636?type=json](https://bili.nekocha.top/live/5055636?type=json)

## Features

- **视频播放** - 通过 BV 号重定向(302)到视频直链接,支持多 P(分P)视频,支持 Web / App 双平台播放源
- **视频信息** - 返回视频标题、封面、UP 主、分 P、时长等解析信息
- **直播信息与直播流** - 获取直播间信息,并解析直播流地址(HLS / FLV / FMP4 / TS)
- **番剧** - 支持番剧/影视信息、分集列表、单集播放地址解析
- **弹幕** - 支持以 XML 或 JSON 形式获取视频弹幕
- **封面** - 支持视频封面图片获取
- **用户合集** - 获取 UP 主某个合集(UGC 合集)下的视频列表
- **自动 CDN 换源** - 根据cfcolo对不同请求地区自动匹配最优 CDN (可通过参数强制指定，CDN策略可配置),优化视频加载速度
- **动态缓存** - 视频信息和播放地址分离缓存,依据视频时长与播放地址有效期动态计算缓存时间;短时间多人播放只解析一次
- **二级缓存** - Edge Cache(边缘节点缓存)+ Workers KV 双层缓存,配合缓存数据校验保证数据有效性
- **绕过 IP 限制** - 通过 Vercel Serverless Functions 代理解析,绕过 B 站对 Cloudflare IP 的限制

## 遇到的已知问题和建议

1. **部署后访问速度慢或者超时**
   请考虑对您的Cloudflare Workers进行IP优选或者域名优选

2. **视频播放速度慢,加载不出来**
   请确认是否使用海外的视频cdn,例如aliov,cosov等以ov结尾的cdn为海外服务器,您可以在视频解析连接后使用cdn参数指定cdn,或者通过配置服务器环境变量为特定地区分配默认cdn _(使用Vercel等代理服务器时因为请求的IP在海外,b站默认会分配海外的CDN服务器)_

3. **在VRCHAT里播放后拖动进度条视频卡住**
   请确保您的播放器能够正确解码视频 (推荐使用AVPro)
   不同CDN对于VRCHAT发起的包含Range字段请求响应可能不同,推荐使用alib或cos,国外推荐aliov

## 快速开始

> [!IMPORTANT]
> 部分路由支持从url参数自动解析所需要的参数,当提供url参数时,其余路径参数和query参数(bvid,p)将会被忽略

### 视频播放

将 BV 号拼接在 `/video/{bvid}` 后,请求会 **302 重定向** 到视频直链接,可直接用于 VRChat 播放器或任意视频播放器:

```bash
curl -I "https://your.workers.domain/video/BV1UT42167xb"
# HTTP/1.1 302 Found
# Location: https://upos-sz-mirrorali.bilivideo.com/...
```

**多 P 视频**:在 BV 号后追加分 P 序号:

```bash
curl -I "https://your.workers.domain/video/BV1LCzTByEBY/2"
```

**仅获取播放地址**(不重定向):

```bash
curl "https://your.workers.domain/video/BV1UT42167xb?type=url"
```

**指定播放平台与 CDN**:

```bash
# platform: web(默认,无需 Referer) / app(需处理 Referer)
curl -I "https://your.workers.domain/video/BV1UT42167xb?platform=app"
# cdn: 指定换源,查看 /video-cdn 获取支持的 CDN
curl -I "https://your.workers.domain/video/BV1UT42167xb?cdn=aliov"
```

### 视频信息

添加 `type=json` 参数即可返回完整解析信息:

```bash
curl "https://your.workers.domain/video/BV1UT42167xb?type=json"
```

```json
{
  "code": 200,
  "message": "Success",
  "data": {
    "bvid": "BV1mNf3BREgj",
    "aid": 116103686725599,
    "cid": 36182625644,
    "url": "https://upos-sz-mirrorali.bilivideo....",
    "pic": "http://i1.hdslb.com/bfs/archive/7c...9f.jpg",
    "duration": 126,
    "info_source": "view",
    "infoSource": "view",
    "title": "【重音テト/中译版】...",
    "owner": {
      "mid": 2705870,
      "name": "...",
      "face": "https://i2.hdslb.com/bfs/face/2a...67.jpg"
    },
    "desc": "...",
    "parts": [
      {
        "page": 1,
        "firstFrame": "https://i1.hdslb.com/bfs/archive/...",
        "duration": 126,
        "partTitle": "...",
        "cid": 36182625644,
        "ctime": 1720000000
      }
    ],
    "originalCdnHostname": "upos-sz-mirrorali.bilivideo.com",
    "quality": 64,
    "platform": "web",
    "urlExpirationAt": 1783415020,
    "urlVideoPart": 1,
    "urlCid": 36182625644
  },
  "time": 1783407821041
}
```

### 直播信息

`/live/{roomId}` 默认为流重定向,添加 `type=json` 返回直播间信息与解析到的直播流地址:

```bash
curl "https://your.workers.domain/live/5055636?type=json"
```

```json
{
  "code": 200,
  "message": "Success",
  "data": {
    "title": "直播间标题",
    "uid": 296909317,
    "roomId": 5055636,
    "shortId": 0,
    "attention": 123456,
    "online": 789,
    "description": "直播间简介",
    "areaId": 371,
    "areaName": "虚拟主播",
    "background": "https://i0.hdslb.com/bfs/live/...",
    "cover": "https://i0.hdslb.com/bfs/live/...",
    "keyframe": "https://i0.hdslb.com/bfs/...",
    "liveTime": "2026-08-25 12:00:00",
    "isLiving": true,
    "stream": {
      "urls": [
        {
          "url": "https://d1--cn-gotcha104.bilivideo.com/live-bvc/...",
          "qn": 250,
          "format": "fmp4",
          "codec": "avc"
        }
      ],
      "platform": "xlive"
    }
  },
  "time": 1783407821041
}
```

### 直播播放

请求 `/live/{roomId}` 会 **302 重定向** 到当前直播流地址,可直接用于播放器播放:

```bash
curl -I "https://your.workers.domain/live/5055636"
# HTTP/1.1 302 Found
# Location: https://d1--cn-gotcha104.bilivideo.com/live-bvc/...
```

支持指定解析平台、编码、封装与协议:

```bash
# platform: xlive(默认,功能更全) / h5
# codec:   avc(默认) / hevc
# format:  fmp4(默认) / flv / ts
# protocol:hls(默认)  / stream
curl -I "https://your.workers.domain/live/5055636?platform=xlive&codec=hevc&format=fmp4&protocol=hls"
# 强制指定海外流(默认根据请求地区自动选择 cn/ov)
curl -I "https://your.workers.domain/live/5055636?ov=true"
```

## API

所有接口均支持 `GET` 请求,可通过路径参数或查询参数传入,返回 JSON 结构为:

```json
{ "code": 200, "message": "Success", "time": 1783407821041, "data": {} }
```

### 视频相关

#### `GET /video/:bvid?/:p?`

解析视频播放链接或视频信息。

| 参数       | 类型                       | 默认    | 说明                                                                            |
| ---------- | -------------------------- | ------- | ------------------------------------------------------------------------------- |
| `bvid`     | string                     | -       | BV 号,如 `BV1UT42167xb`                                                         |
| `p`        | number                     | `1`     | 分 P 序号,`0` 等价于 `1`                                                        |
| `type`     | `video` \| `json` \| `url` | `video` | `video`:302 重定向到直链;`json`:返回解析结果;`url`:仅返回播放地址文本           |
| `platform` | `web` \| `app`             | `web`   | `web`:Web 播放源,无需 Referer;`app`:iOS/TV 播放源,播放时需携带 Referer,否则 403 |
| `cdn`      | string                     | 自动    | 强制换源,查看 `/video-cdn` 获取可用 CDN 名称                                    |
| `qn`       | number                     | `64`    | 清晰度(当前固定为 64)                                                           |
| `url`      | string                     | -       | bilibili 视频链接,自动提取 BV 号与分 P,支持 `b23.tv` 短链                       |

```bash
# url 参数传参,等价于 /video/{bvid}
curl "https://your.workers.domain/video?url=https://www.bilibili.com/video/BV1mNf3BREgj"
```

#### `GET /cover/:bvid?`

获取视频封面。

| 参数   | 类型                         | 默认  | 说明                                                                          |
| ------ | ---------------------------- | ----- | ----------------------------------------------------------------------------- |
| `bvid` | string                       | -     | BV 号                                                                         |
| `url`  | string                       | -     | bilibili 视频链接                                                             |
| `type` | `img` \| `url` \| `redirect` | `img` | `img`:代理图片(带 Referer);`url`:返回封面直链文本;`redirect`:302 重定向到封面 |

```bash
curl "https://your.workers.domain/cover/BV1UT42167xb?type=url"
```

#### `GET /danmaku/:bvid?`

获取视频弹幕。

| 参数   | 类型            | 默认  | 说明                                                                                                          |
| ------ | --------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| `bvid` | string          | -     | BV 号                                                                                                         |
| `cid`  | number          | -     | 视频 cid(提供时优先,免去解析 BV 号)                                                                           |
| `url`  | string          | -     | bilibili 视频链接                                                                                             |
| `type` | `xml` \| `json` | `xml` | `xml`:返回标准 XML;`json`:返回结构化 JSON(含 `danmakus[]`,字段含时间/模式/字号/颜色/发送时间/类型/用户哈希等) |

```bash
curl "https://your.workers.domain/danmaku/BV1UT42167xb"
curl "https://your.workers.domain/danmaku/BV1UT42167xb?type=json"
```

#### `GET /cdn`

返回可用的视频 CDN 列表(upos 系列):

```json
{
  "code": 200,
  "message": "Success",
  "data": {
    "ali": "upos-sz-mirrorali.bilivideo.com",
    "aliov": "upos-sz-mirroraliov.bilivideo.com",
    "alib": "upos-sz-mirroralib.bilivideo.com"
  },
  "time": 1783407821041
}
```

### 直播相关

#### `GET /live/:roomId?`

获取直播间信息并解析直播流。

| 参数       | 类型                    | 默认     | 说明                                                                    |
| ---------- | ----------------------- | -------- | ----------------------------------------------------------------------- |
| `roomId`   | number                  | -        | 房间号(支持短号别名)                                                    |
| `url`      | string                  | -        | `live.bilibili.com` 直播链接                                            |
| `type`     | `stream` \| `json`      | `stream` | `stream`:302 重定向到直播流;`json`:返回直播间信息 + 流地址              |
| `platform` | `xlive` \| `h5`         | `xlive`  | 解析平台,`xlive` 支持更多格式                                           |
| `codec`    | `avc` \| `hevc`         | `avc`    | 编码(仅 xlive)                                                          |
| `format`   | `fmp4` \| `flv` \| `ts` | `fmp4`   | 封装格式(仅 xlive)                                                      |
| `protocol` | `hls` \| `stream`       | `hls`    | 拉流协议(仅 xlive)                                                      |
| `ov`       | boolean                 | 自动     | `true`:强制使用海外(ov)流;`false`:强制国内(cn)流;默认按请求地区自动选择 |

```bash
curl "https://your.workers.domain/live?url=https://live.bilibili.com/5055636"
```

### 番剧相关

#### `GET /bangumi/info`

获取番剧/影视信息。`ssid`(剧集 `ss`)、`mdid`(影视 `md`)、`epid`(单集 `ep`)三选一,可省略前缀。

```bash
curl "https://your.workers.domain/bangumi/info?epid=ep378374"
curl "https://your.workers.domain/bangumi/info?ssid=37498"
curl "https://your.workers.domain/bangumi/info?mdid=28231832"
```

#### `GET /bangumi/episodes`

获取番剧分集列表。`ssid` / `mdid` 二选一。

```bash
curl "https://your.workers.domain/bangumi/episodes?ssid=37498"
```

#### `GET /bangumi/play/:epid?`

解析单集播放地址。

| 参数   | 类型              | 默认    | 说明                                                     |
| ------ | ----------------- | ------- | -------------------------------------------------------- |
| `epid` | number            | -       | 剧集号(可带 `ep` 前缀)                                   |
| `type` | `video` \| `json` | `video` | `video`:307 跳转到 `/pplay` 代理播放;`json`:返回解析结果 |
| `qn`   | number            | `64`    | 清晰度(当前固定为 64)                                    |
| `cdn`  | string            | `ali`   | 指定 CDN                                                 |

```bash
curl "https://your.workers.domain/bangumi/play/ep378374?type=json"
```

### 用户相关

#### `GET /user/archieve/:mid?/:sid?`

获取 UP 主某个 UGC 合集下的视频列表。

| 参数       | 类型   | 默认 | 说明     |
| ---------- | ------ | ---- | -------- |
| `mid`      | number | -    | 用户 mid |
| `sid`      | number | -    | 合集 id  |
| `page`     | number | `1`  | 页码     |
| `pageSize` | number | `30` | 每页数量 |

```bash
curl "https://your.workers.domain/user/archieve/296909317/3091395?page=1&pageSize=30"
```

### 其他

#### `GET /ipregion`

返回请求出口 IP 所属地区。

```bash
curl "https://your.workers.domain/ipregion"
```

### 响应头

| 头                                                         | 说明                                           |
| ---------------------------------------------------------- | ---------------------------------------------- |
| `X-Cache-Edge-Hit`                                         | 命中的 Edge Cache key(MD5),未命中为 `MISS`     |
| `X-Cache-KV-Hit`                                           | 命中的 KV Cache key(MD5),未使用 KV 为 `NOTUSE` |
| `X-Bili-CDN`                                               | 实际使用的播放 CDN 域名                        |
| `X-CDN-Strategy`                                           | 命中的 CDN 策略(地区,地区,CDN 名)              |
| `X-Stream-Server`                                          | 直播流服务器(`cn` / `ov`)                      |
| `X-Stream-Parse-Platform`                                  | 直播解析平台(`xlive` / `h5`)                   |
| `X-Stream-Format` / `X-Stream-Codec` / `X-Stream-Protocol` | 直播流格式/编码/协议(xlive)                    |
| `X-URL-CID` / `X-URL-Vpart`                                | 视频播放地址对应的 cid / 分 P                  |
| `Server-Version`                                           | 服务端版本                                     |

## 部署解析站

### 1. 部署代理服务器

可参考 [Proxy-Vercel](https://github.com/kiyonya/proxy-vercel) 使用Vercel部署解析代理
这可能会影响后续的配置和解析的IP地址位置,确保您的代理服务器可以转发请求且可以被Cloudflare Workers访问

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 `wrangler.jsonc`

参考 [Wrangler 配置文档](https://developers.cloudflare.com/workers/wrangler/configuration/)。

> [!Tip]
> 您可以查看项目根目录下的`warngler.example.jsonc`的配置示范,或者您可以重命名删除`.example`后填入信息直接部署

绑定 Workers KV 存储库:

```jsonc
"kv_namespaces": [
    {
        "binding": "BILI_API_CACHE",
        "id": "你的KV存储库ID"
    }
]
```

配置请求限流(可选,需在 Cloudflare 后台创建 Rate Limiting 策略):

```jsonc
"ratelimits": [
    {
        "name": "RATE_LIMITER",
        "namespace_id": "100",
        "simple": {
            "limit": 100,
            "period": 60
        }
    }
]
```

### 4. 配置环境变量

在 `wrangler.jsonc` 的 `vars` 中配置环境变量:

#### 环境变量

| 变量                                  | 默认值   | 说明                                                                                                   |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `CONFIG_CacheValidation`              | `true`   | 启用缓存校验                                                                                           |
| `CONFIG_UseProxyFetch`                | `true`   | 使用代理服务器                                                                                         |
| `CONFIG_ProxyToken`                   | -        | 代理服务器 Token(Bearer 认证)                                                                          |
| `CONFIG_ProxyServerUrl`               | -        | 代理服务器地址                                                                                         |
| `CONFIG_ProxyFetchTimeout`            | `10000`  | 代理超时时间(毫秒)                                                                                     |
| `CONFIG_ProxyFetchMaxRetries`         | `3`      | 代理请求失败最大重试次数(指数退避)                                                                     |
| `CONFIG_BiliVideoPlayUrlCacheTime`    | `5400`   | 视频播放地址最大缓存时间(秒)                                                                           |
| `CONFIG_BiliBangumiPlayUrlCacheTime`  | `5400`   | 番剧播放地址最大缓存时间(秒)                                                                           |
| `CONFIG_BiliLiveCacheTime`            | `60`     | 直播信息缓存时间(秒)                                                                                   |
| `CONFIG_BiliVideoInfoCacheTime`       | `86400`  | 视频信息缓存时间(秒)                                                                                   |
| `CONFIG_BiliBangumiEpisodesCacheTime` | `604800` | 番剧分集缓存时间(秒)                                                                                   |
| `CONFIG_BiliBangumiInfoCacheTime`     | `604800` | 番剧信息缓存时间(秒)                                                                                   |
| `CONFIG_UGCSeasonArchieveCacheTime`   | `86400`  | 用户合集缓存时间(秒)                                                                                   |
| `CONFIG_BiliDanmakuCacheTime`         | `1800`   | 弹幕缓存时间(秒)                                                                                       |
| `CONFIG_CDNS_DEFAULT`                 | -        | CDN 策略组,格式 `大洲,地区,CDN名;...`,`*` 表示任意匹配,优先级高于通用规则。例如 `AS,CN,alib;*,*,aliov` |
| `SERVER_VERSION`                      | -        | 服务端版本号,会写入 `Server-Version` 响应头                                                            |

```jsonc
"vars": {
    "CONFIG_UseProxyFetch": true,
    "CONFIG_ProxyToken": "Your Proxy Token",
    "CONFIG_ProxyServerUrl": "Your Proxy Server URL",
    "CONFIG_ProxyFetchMaxRetries": 3,
    "CONFIG_ProxyFetchTimeout":10000,
    "CONFIG_CacheValidation":true,
    "CONFIG_BiliVideoPlayUrlCacheTime": 5400,
    "CONFIG_BiliBangumiPlayUrlCacheTime": 5400,
    "CONFIG_BiliLiveCacheTime": 60,
    "CONFIG_BiliVideoInfoCacheTime": 86400,
    "CONFIG_BiliBangumiEpisodesCacheTime": 604800,
    "CONFIG_BiliBangumiInfoCacheTime": 604800,
    "CONFIG_UGCSeasonArchieveCacheTime": 86400,
    "CONFIG_BiliDanmakuCacheTime": 1800,
    "CONFIG_VideoCDNStrategy": "AS,CN,alib;*,*,aliov",
  },
```

### 5. 本地开发

```bash
npm run dev
```

本地开发时可用 `.env.dev` 加载环境变量。

### 6. 部署到 Cloudflare Workers

```bash
npm run deploy
```

部署完成后访问,`https://your.workers.domain/` 如果可以显示信息页面即部署完成。

## 声明

> 使用本项目即表示您已阅读并同意以下条款：

1. **学习用途**：本项目仅供开发者技术学习和研究使用
2. **禁止商用**：严禁将本项目用于搭建公开的大规模视频代理服务
3. **隐私保护**：本项目不会收集任何个人信息，所有解析均在未登录状态下完成
4. **版权声明**：视频内容版权归 Bilibili 及原作者所有，请尊重版权
5. **使用规范**：严禁非法分发视频，严禁使用本项目进行数据爬取
6. **风险告知**：
   - 使用者自行承担因使用本项目导致的账号/IP 封禁风险
   - 包括但不限于：Vercel、Cloudflare、Bilibili 及其相关服务供应商
7. **非盈利**：本项目为开源项目，不进行任何盈利行为
