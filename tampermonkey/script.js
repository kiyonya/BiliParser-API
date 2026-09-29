// ==UserScript==
// @name         复制B站视频解析站地址
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  在B站视频页左下角添加按钮，复制解析站链接到剪贴板，粘贴后可以快捷播放
// @author       Nekocha
// @match        *://www.bilibili.com/video/*
// @match        *://live.bilibili.com/*
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';
    const videoPattern = new URLPattern("*://*.bilibili.com/video/*")
    const livePattern = new URLPattern("*://live.bilibili.com/*")
    const api = "https://bili.nekocha.top"
    const buttonText = "复制解析地址"
    const button = document.createElement('div');
    button.id = 'bili-copy-parse-btn';
    button.innerHTML = buttonText;
    Object.assign(button.style, {
        position: 'fixed',
        bottom: '60px',
        left: '20px',
        zIndex: '9999',
        padding: '10px 16px',
        backgroundColor: '#fb7299',
        color: '#fff',
        border: 'none',
        borderRadius: '20px',
        fontSize: '14px',
        fontWeight: 'bold',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        transition: 'all 0.3s ease',
        fontFamily: 'Arial, sans-serif'
    });
    button.addEventListener('mouseenter', function () {
        this.style.backgroundColor = '#ff85a6';
        this.style.transform = 'scale(1.05)';
    });
    button.addEventListener('mouseleave', function () {
        this.style.backgroundColor = '#fb7299';
        this.style.transform = 'scale(1)';
    });
    button.addEventListener('click', () => {
        let parseTarget = null
        let tipTimeout
        const url = new URL(window.location.href)
        if (videoPattern.test(url)) {
            const pathname = url.pathname
            const bvpart = pathname.match(/(BV[a-zA-Z0-9]{10})/)?.[1]
            const part = url.searchParams.get("p")
            if (bvpart) {
                const target = new URL(api)
                target.pathname = `/video/${bvpart}`
                if (part) {
                    target.searchParams.set("p", String(part))
                }
                parseTarget = target
            }
        }
        else if (livePattern.test(url)) {
            const path = url.pathname
            const roomId = path.substring(1).split("/").shift()
            if (roomId) {
                const target = new URL(api)
                target.pathname = `/live/${roomId}`;
                parseTarget = target
            }
        }
        if (parseTarget) {
            const u = parseTarget.toString()
            try {
                navigator.clipboard.writeText(u).then(() => {
                    button.innerHTML = "已复制"
                    clearTimeout(tipTimeout)
                    tipTimeout = setTimeout(() => {
                        button.innerHTML = buttonText
                    }, 800);
                })
            } catch (error) {

            }
        }
    })
    document.body.appendChild(button)
})();