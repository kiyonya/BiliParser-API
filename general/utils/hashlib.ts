import crypto from 'crypto'
export function md5String(i:string){
    return crypto.createHash("md5").update(i).digest("hex")
}

export function hmacSha256(key:string,i:string){
    return crypto.createHmac("sha256",key).update(i).digest('hex')
}