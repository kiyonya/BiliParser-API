
export async function proxyFetch(url: string | URL, init?: RequestInit) {

    const headers = new Headers(init?.headers)
    headers.append('Authorization', `Bearer ${process.env.X_VERCEL_PROXY_TOKEN}`)
    const proxyFetchUrl = new URL(`${process.env.X_VERCEL_PROXY_URL}`)
    proxyFetchUrl.searchParams.set('url', url.toString())
    return fetch(proxyFetchUrl, {
        ...init,
        headers: headers
    })
    
}