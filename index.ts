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

export const Data = {
    NamedError<Name extends string>(name: Name) {
        return class <A extends Record<string, any> = {}> extends Error {
            override readonly name: Name = name;
            readonly meta: A;
            constructor(args?: (A & { message?: string; cause?: unknown }) | { message?: string; cause?: unknown }) {
                const { message, cause, ...meta } = args || {};
                super(message);
                this.name = name;
                this.cause = cause;
                this.meta = meta as A;
                Object.setPrototypeOf(this, new.target.prototype);
            }
        };
    }
}

export const Program = {
    tryCatch<Ctx extends Context>(prog: Program<Ctx>, fn: (prog: Program<Ctx>) => any, handlers?: ErrorHandlers<Ctx>): unknown {
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
            const result = fn(prog);
            return result instanceof Promise ? result.catch(handleError) : result;
        } catch (error: unknown) {
            return handleError(error);
        }
    },
    create<Ctx extends Context>(context: Ctx): Program<Ctx> {
        const program: Program<Ctx> = {
            controller: new AbortController(),
            get signal() { return this.controller!.signal; },
            ctx: context,
            tryCatch: () => void 0,
        };

        program.tryCatch = ((fn, handlers) => Program.tryCatch(program, fn, handlers));

        return program;
    },
    prepare<Ctx extends Context = Context, Fn extends (prog: Program<Ctx>) => any = (prog: Program<Ctx>) => any>(fn: Fn, handlers?: ErrorHandlers<Ctx>) {
        const program = Program.create<Ctx>({} as Ctx);
        let _handlers: ErrorHandlers<Ctx> = handlers || {};

        const run = (ctx?: Ctx) => {
            program.ctx = ctx || program.ctx;
            return program.tryCatch(fn, _handlers);
        }

        const provide = (ctx?: Ctx) => {
            program.ctx = ctx || program.ctx;
            return { run };
        }

        const catchFn = (handlers: ErrorHandlers<Ctx>) => {
            _handlers = { ..._handlers, ...handlers };
            return { run };
        }

        return {
            catch: catchFn,
            provide,
            run,
        }
    },
}

export class Service<Ctx extends Context = Context> {
    protected prog: Program<Ctx>;
    constructor(context?: Ctx) {
        this.prog = Program.create<Ctx>(context || {} as Ctx);

        (this as any).acquire?.();
        (this as any).acquireAsync?.();
    }

    [Symbol.dispose]() {
        return (this as any).dispose?.();
    }
    [Symbol.asyncDispose]() {
        return (this as any).disposeAsync?.();
    }

    static use<T extends KV<Service>>(kv: T) {
        return {
            ...kv,
            [Symbol.dispose]() {
                for (const service of Object.values(kv)) {
                    service[Symbol.dispose]?.();
                }
            },
            [Symbol.asyncDispose]() {
                return Promise.allSettled(Object.values(kv)
                    .map(service => service[Symbol.asyncDispose]?.() || Promise.resolve()));
            }
        } as unknown as FlattenUnion<T & { [Symbol.dispose](): void;[Symbol.asyncDispose](): Promise<void> }>;
    }
}