import type { Context } from "./context";

export class Service<Ctx extends Context> {
    protected ctx: Ctx;

    constructor(context: Ctx) {
        this.ctx = context;
    }

    get errors() {
        return this.ctx.errors as Ctx['errors'];
    }

    get features() {
        return this.ctx.features as Ctx['features'];
    }

    get services() {
        return this.ctx.services as Ctx['services'];
    }

    get use() {
        return this.ctx.use as Ctx['use'];
    }

    static create<Ctx extends Context = Context>() {
        return class GeneratedService extends Service<Ctx> {
            static _errors: Ctx['errors'];
            constructor(context: Ctx) {
                super(context);
            }
        }
    }
}

