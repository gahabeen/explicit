
type Constructor<T = any> = new (...args: any[]) => T;
type Key = string | number | symbol;
type KV<V = any> = Record<Key, V>;
type FlattenUnion<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? { [K in keyof I]: I[K] } : never;

type MapErrors<T extends Error[] = []> = { [K in T[number]as K['name']]: Constructor<K> };
type ErrorKeys<T> = { [K in keyof T]: T[K] extends Constructor<Error> ? K : never }[keyof T];
type ErrorsOnly<T> = { [K in keyof T as T[K] extends Constructor<Error> ? K : never]: T[K] };
type ExtractCtx<T> = T extends Service<infer Ctx> ? Ctx : never;
type ServicesValues<T> = FlattenUnion<{ [K in keyof T]: T[K] extends Service<any> ? ExtractCtx<T[K]> : never }[keyof T]>;
type AllErrors<Ctx extends Context> = FlattenUnion<ErrorsOnly<Ctx> & ErrorsOnly<ServicesValues<Ctx>>>;
type ErrorHandlers<Ctx extends Context> = { [K in (ErrorKeys<AllErrors<Ctx>> | 'Any')]?: (err: Error) => void | Promise<void> };

type ContextRequirements = KV<Error | Service | unknown>
export type Context<Requirements extends ContextRequirements = ContextRequirements, AdditionalErrorRequirements extends Error[] = []> = FlattenUnion<Requirements & MapErrors<AdditionalErrorRequirements>>

type ProgramExecute<Ctx extends Context> = (fn: (prog: Program<Ctx>) => any, handlers?: ErrorHandlers<Ctx>) => unknown;
type Program<Ctx extends Context = Context> = {
    controller: AbortController;
    get signal(): AbortSignal;
    tryCatch: ProgramExecute<Ctx>;
    ctx: Ctx;
}

export const TaggedError = {
    create<Tag extends string>(tag: Tag) {
        return class <A extends Record<string, any> = {}> extends Error {
            override readonly name: Tag = tag;
            constructor(args?: (A & { message?: string; parent?: any }) | { message?: string; parent?: any }) {
                super(args?.message);
                this.name = tag;
                Object.setPrototypeOf(this, new.target.prototype);
            }
        };
    }
}

export const Program = {
    create<Ctx extends Context>(context: Ctx): Program<Ctx> {
        const program: Program<Ctx> = {
            controller: new AbortController(),
            get signal() { return this.controller!.signal; },
            ctx: context,
            tryCatch: () => void 0,
        };

        program.tryCatch = (fn: (prog: Program<Ctx>) => any, handlers?: ErrorHandlers<Ctx>) => {
            const handleError = (error: unknown) => {
                if (error instanceof Error) {
                    const handler = handlers?.[error.name as keyof ErrorHandlers<Ctx>] || handlers?.Any;
                    if (handler) {
                        return handler(error);
                    }
                }
                throw error;
            }

            try {
                const result = fn(program);
                return result instanceof Promise ? result.catch(handleError) : result;
            } catch (error: unknown) {
                return handleError(error);
            }
        };

        return program;
    },
    prepare<Ctx extends Context, Fn extends (prog: Program<Ctx>) => any = (prog: Program<Ctx>) => any>(fn: Fn, handlers?: ErrorHandlers<Ctx>) {
        const program = Program.create<Ctx>({} as Ctx);

        return {
            run: (ctx: Ctx) => {
                program.ctx = ctx;
                return program.tryCatch(fn, handlers);
            },
        }
    },
}

export class Service<Ctx extends Context = Context> {
    protected prog: Program<Ctx>;
    constructor(context: Ctx) {
        this.prog = Program.create<Ctx>(context);
    }
}