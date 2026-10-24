import CryptoJS from "crypto-js"
export function md5String(i:string){
    return CryptoJS.MD5(i).toString(CryptoJS.enc.Hex)
}
export function hmacSha256(key:string,i:string){
    return CryptoJS.HmacSHA256(i,key).toString(CryptoJS.enc.Hex)
}