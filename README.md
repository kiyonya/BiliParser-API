# Cloudflare BiliParser API

基于Cloudflare Workers和Vercel部署的bilibili视频直链接和视频信息的解析服务
使用Workers KV对视频信息和播放地址分离缓存,根据视频时长动态计算缓存时间,最大化利用缓存提高解析速度

![MIT](https://img.shields.io/badge/-VRCHAT%20Support-blue?style=for-the-badge&logo=vrchat) ![MIT](https://img.shields.io/badge/-Cloudflare%20Workers-orange?style=for-the-badge&logo=cloudflare&logoColor=white) ![TS](https://img.shields.io/badge/-Typescript-blue?style=for-the-badge&logo=typescript&logoColor=white) ![LIC](https://img.shields.io/badge/LICENSE-MIT-green?style=for-the-badge)

## Try (测试中)

[https://bili.nekocha.top/video/BV1UT42167xb](https://bili.nekocha.top/video/BV1UT42167xb)
[https://bili.nekocha.top/video/BV1UT42167xb?type=json](https://bili.nekocha.top/video/BV1UT42167xb?type=json)

## Features

- 支持VRChat播放器(VizVid / ProTV)播放
- 支持从BV号重定向到直链接
  例如:`https://your.workers.domain/video/${BV号}` 重定向到 `upos-sz-mirrorali.bilivideo.com/*`
- 支持视频解析信息 替换播放地址cdn (查看支持的cdn) 切换解析平台
  例如: `https://bili.nekocha.top/video/BV1mNf3BREgj?type=json`

## 响应
### 响应头
- X-Info-Cache-Hit: 视频信息是否来自缓存
- X-URL-Cache-Hit: 视频播放地址是否来自缓存
### 响应体
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
    "title": "【重音テト/中译版】...",
    "owner": {
      "mid": 2705870,
      "name": "...",
      "face": "https://i2.hdslb.com/bfs/face/2a...67.jpg"
    },
    "quality": 64,
    "platform": "web",
    "urlExpirationAt": 1783415020
  },
  "time": 1783407821041
}
```

- 使用Workers KV数据库根据视频时长和url期限动态缓存，减少响应时间，在缓存有效期内相同请求不会重复解析，短时间多人播放只解析一次。
- 使用Vercel Serverless Functions部署解析来绕过B站对Cloudflare IP的限制

## 部署

1. 部署Vercel代理服务器
   您可以参考 [Proxy-Vercel](https://github.com/kiyonya/proxy-vercel)
2. 克隆项目并安装依赖

```bash
npm install
```

3. 配置 `wrangler.jsonc`
   查看 [https://developers.cloudflare.com/workers/wrangler/configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)

```jsonc
/**
填写你的环境变量或者使用env文件
*/
"vars": {
    "X_VERCEL_PROXY_TOKEN": "VERCEL代理Token",
    "X_VERCEL_PROXY_URL": "VERCEL代理地址",
    "X_KVTTL":"服务器最大缓存时间(秒)"
  }
```

```jsonc
/**
链接你的Workers KV存储库
*/
"kv_namespaces": [
    {
        "binding": "BILI_CACHE",
        "id": "你的KV存储库ID"
    }
]
```

4. 运行开发

```bash
npm run dev
```

5. 部署到Cloudflare Workers

```bash
npm run deploy
```

## API

`/video/:bvid?`
解析视频播放链接或者视频信息

### Params

- type?: "json" | "video" | "url"
  默认: video
  当type为json时返回视频的解析结果,当type为video时会重定向(302)到视频源`upos-sz..`,当type为url时仅返回视频播放的url链接

- platform?: "web" | "app"
  默认: web
  web:使用Web段播放接口请求视频播放源,播放URL不需要携带Referer头
  app:使用ios和tv的接口请求视频播放源,需要处理Referer才能正常播放，否则会返回 403

- cdn?: string
  查看 `https://your.workers.domain/video-cdn` 查看支持的cdn, 当携带cdn参数时,url的地址将会被自动换源

```json
例如:
{
  "code": 200,
  "message": "Success",
  "data": {
    "ali": "upos-sz-mirrorali.bilivideo.com",
    "aliov": "upos-sz-mirroraliov.bilivideo.com",
    "alib": "upos-sz-mirroralib.bilivideo.com",
  }
}
```

其中 `ali`, `aliov` 为cdn名称
请求例如 `https://your.workers.domain/video/BV1mNf3BREgj?cdn=aliov`

- url?:string
  该接口同时支持使用url来传参,会自动处理url的类型并从中提取BV号
  `https://your.workers.domain/video?url=https://www.bilibili.com/video/BV1mNf3BREgj` 等价于 `https://your.workers.domain/video/BV1mNf3BREgj`

`/video-cdn`
返回主要可换源的cdn,目前只写了upos开头的服务商cdn
例如:

```json
{
  "code": 200,
  "message": "Success",
  "data": {
    "ali": "upos-sz-mirrorali.bilivideo.com",
    "aliov": "upos-sz-mirroraliov.bilivideo.com",
    "alib": "upos-sz-mirroralib.bilivideo.com"
  }
}
```

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
