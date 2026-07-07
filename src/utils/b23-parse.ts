
export async function b23Parser(b23: string): Promise<string> {
    const url = new URL(b23)
    const pattern = new URLPattern("https://b23.tv/*")
    if (!pattern.test(url)) {
        throw new Error("Not a b23 url")
    }
    const req = await fetch(url,{
        method:"HEAD",
        redirect:'manual'
    })
    const headers = req.headers
    const location = headers.get("location")
    if(!location){
        throw new Error("No location header found")
    }
    return location
}   