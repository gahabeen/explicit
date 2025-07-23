export type TaggedError = { _tag?: string } & Error;
export type TaggedErrorConsructor = new (...args: any[]) => TaggedError;

export type ExtractErrorMap<T extends TaggedErrorConsructor[]> = {
    [K in T[number]as InstanceType<K> extends { _tag: infer Tag }
    ? Tag extends string | number | symbol
    ? Tag
    : never
    : never]: K
};

export class BaseError<A extends Record<string, any> = Record<string, never>> extends Error {
    readonly details: A = {} as A;
    _tag?: string;

    constructor(args?: A & { message?: string; parent?: any }) {
        super(args?.message);

        if (args?.parent) {
            this.stack = args.parent.stack;
        }

        if (args) {
            // biome-ignore lint/correctness/noUnusedVariables: <explanation>
            const { parent, ...rest } = args;
            Object.assign(this.details, rest);
        }
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export function TaggedError<Tag extends string>(tag: Tag) {
    return class <A extends Record<string, any> = {}> extends BaseError<A> {
        override readonly _tag: Tag = tag;
        constructor(args?: (A & { message?: string; parent?: any }) | { message?: string; parent?: any }) {
            super(args as A & { message?: string; parent?: any });
            this.name = tag;
        }
    };
}