import { main } from "bun";

type Key = string | number | symbol;
type KV<V = any> = Record<Key, V>;

type Constructor<T = any> = abstract new (...args: any[]) => T;

export type TaggedError<Tag extends string = string, A extends KV = {}> = FlattenUnion<{ _tag: Tag } & BaseError<A>>;
export type TaggedErrorConsructor = Constructor<TaggedError>;

export class BaseError<A extends KV = Record<string, never>> extends Error {
    readonly details: A = {} as A;
    _tag?: string;

    constructor(args?: A & { message?: string; parent?: any }) {
        super(args?.message);

        if (args?.parent) {
            this.stack = args.parent.stack;
        }

        if (args) {
            const { parent, ...rest } = args;
            Object.assign(this.details, rest);
        }
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export function TaggedError<Tag extends string>(tag: Tag) {
    return class <A extends KV = {}> extends BaseError<A> {
        override readonly _tag: Tag = tag;
        constructor(args?: (A & { message?: string; parent?: any }) | { message?: string; parent?: any }) {
            super(args as A & { message?: string; parent?: any });
            this.name = tag;
        }
    };
}

export type Errors<
    T extends TaggedError[] = []
> = {
        [K in T[number]as K['_tag'] extends Key ? K['_tag'] : never]: Constructor<K>
    };

type ErrorKeys<T> = {
    [K in keyof T]: T[K] extends TaggedError ? K : never
}[keyof T];

type ServiceKeys<T> = {
    [K in keyof T]: T[K] extends { _ctx: any } ? K : never
}[keyof T];

export class Service<Ctx extends Context = Context> {
    protected ctx: Ctx;

    constructor(context: Ctx) {
        this.ctx = context;
    }
}

export type Program<Ctx = {}> = {
    controller: AbortController;
    get signal(): AbortSignal;
    ctx: Ctx;
}

export type FlattenUnion<U> = (
    U extends any ? (k: U) => void : never
) extends (k: infer I) => void
    ? { [K in keyof I]: I[K] }
    : never;

type ContextRequirements = KV<TaggedError | Service | unknown>

export type Context<Requirements extends ContextRequirements = ContextRequirements, Errs extends TaggedError[] = []> = FlattenUnion<Requirements & Errors<Errs>>

export type ExtractErrors<T extends Context> = Pick<T, ErrorKeys<T>>;
export type ExtractServices<T extends Context> = Pick<T, ServiceKeys<T>>;
export type ExtractFeatures<T extends Context> = Omit<T, ErrorKeys<T> | ServiceKeys<T>>;
export type OmitErrors<T extends Context> = Omit<T, ErrorKeys<T>>;

export const createContext = <Requirements extends ContextRequirements>(requirements: Requirements): Context<Requirements> => {
    return requirements as unknown as Context<Requirements>;
}

export const createProgram = <Ctx extends Context>(ctx: Ctx): Program<Ctx> => {
    return {
        controller: new AbortController(),
        get signal() {
            return this.controller.signal;
        },
        ctx,
    };
}

///
type FetchContext = Context<
    { fetch: (url: string, options?: RequestInit) => Promise<Response>; }
>;

class FetchService extends Service<FetchContext> {
    async fetch(url: string, options?: RequestInit): Promise<Response> {
        return await this.ctx.fetch(url, options);
    }
 }

class CrashError extends TaggedError('CrashError') { }
class NetworkError extends TaggedError('NetworkError') { }

type MainContext = Context<
    {
        hello: (name: string) => Promise<string>;
        fetchService: FetchService,
    },
    [CrashError, NetworkError]
>;

// type MainProgram = Program<MainContext>;

// const run = <Ctx extends Context, P extends Program<Ctx> = Program<Ctx>>(prog: P, fn: (p: P, ...args: any[]) => Promise<any>) => {
//     return async (...args: any[]) => {
//         if (!prog.ctx) {
//             throw new Error("Program context is not initialized.");
//         }
//         return await fn(prog, ...args);
//     }
// }

const fetchService = new FetchService({ fetch });

const mainContext = createContext<MainContext>({
    hello: async (name: string) => `Hello, ${name}!`,
    fetchService,
    CrashError,
    NetworkError,
});

const mainProgram = createProgram(mainContext);

mainProgram.ctx.fetchService.fetch('https://api.example.com/data')