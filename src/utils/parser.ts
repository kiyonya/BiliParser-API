import { AppContext } from "../types"
import BiliCrypto from "./bili-crypto"
import SharedData from "../shared/data"

export default abstract class Parser{

    protected ctx: AppContext
    protected BCrypto: BiliCrypto

    constructor(ctx: AppContext) {
        this.ctx = ctx
        this.BCrypto = new BiliCrypto(ctx)
    }
}