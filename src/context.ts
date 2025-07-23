import type { ExtractErrorMap, TaggedErrorConsructor } from "./error";
import type { FlattenUnion } from "./utils";

export type IService = {
    errors: Context['errors'];
    features: Context['features'];
}

export type ContextObject<
    Features extends Record<string, any> = any,
    Errors extends Record<string, TaggedErrorConsructor> = Record<string, TaggedErrorConsructor>,
    Services extends Record<string, IService> = Record<string, IService>
> = {
    Features?: Features;
    Errors?: Errors;
    Services?: Services;
};

type ServiceErrorKeys<Ctx extends ContextObject> =
    Ctx['Services'] extends Record<string, IService>
    ? {
        [K in keyof Ctx['Services']]: keyof Ctx['Services'][K]['errors']
    }[keyof Ctx['Services']]
    : never;

type AllErrorKeys<Ctx extends ContextObject> = keyof Ctx['Errors'] | ServiceErrorKeys<Ctx>;

type ErrorHandlersAsync<Ctx extends ContextObject> =
    { [K in AllErrorKeys<Ctx>]?: (err: Error) => Promise<void> } & { Any?: (err: Error) => Promise<void> };

type ErrorHandlersSync<Ctx extends ContextObject> =
    { [K in AllErrorKeys<Ctx>]?: (err: Error) => void } & { Any?: (err: Error) => void };

export class Context<Ctx extends ContextObject = ContextObject> {
    errors: Ctx['Errors'];
    features: Ctx['Features'];
    services: Ctx['Services'];
    controller: AbortController | undefined;
    private initiated: boolean = false;

    constructor(definition: { errors: Ctx['Errors'], features: Ctx['Features'], services: Ctx['Services'] }) {
        this.errors = definition.errors;
        this.features = definition.features;
        this.services = definition.services;
    }

    private clone(): this {
        return new (this.constructor as any)({
            errors: this.errors,
            features: this.features,
            services: this.services
        }) as this;
    }

    get use() {
        return {
            ...this.features,
            ...this.services,
            ...this.errors,
        }
    }

    get signal() {
        return this.controller?.signal;
    }

    init(opts?: { parent?: AbortController }): this {
        if (this.initiated) return this;

        const parent = opts?.parent;
        const self = this.clone();
        self.initiated = true;

        self.controller = new AbortController();
        for (const key in self.use) {
            const child = self.use[key];
            if (child instanceof Context) {
                child.init({ parent: self.controller });
            }
        }

        if (parent instanceof AbortController) {
            self.controller.signal.addEventListener('abort', () => {
                parent.abort();
            });
        }

        return self;
    }

    run<Fn extends (ctx: typeof this, ...args: any[]) => unknown>(
        fn: Fn,
        ...otherArgs: Parameters<Fn> extends [any, ...infer Rest] ? Rest : never
    ): ReturnType<Fn> | undefined {
        return fn(this.init(), ...otherArgs as any) as ReturnType<Fn>;
    }

    // runSafe<Fn extends (ctx: typeof this, ...args: any[]) => unknown>(
    //     fn: Fn,
    //     ...otherArgs: Parameters<Fn> extends [any, ...infer Rest] ? Rest : never
    // ): ReturnType<Fn> | undefined {
    //     this.controller = new AbortController();
    //     try {
    //         const result = fn(this, ...otherArgs as any) as ReturnType<Fn>;

    //         if (result instanceof Promise) {
    //             return result.catch(() => undefined as any) as ReturnType<Fn>;
    //         }

    //         return result;
    //     } catch {
    //         return;
    //     }
    // }

    catch<Fn extends () => unknown>(
        fn: Fn,
        handlers?: ReturnType<Fn> extends Promise<unknown> ? ErrorHandlersAsync<Ctx> : ErrorHandlersSync<Ctx>
    ): ReturnType<Fn> extends Promise<unknown>
        ? Promise<Awaited<ReturnType<Fn>> | undefined>
        : Awaited<ReturnType<Fn>> | undefined {
        if (!this.initiated) {
            throw new Error("Context must be initialized before running catch.");
        }

        try {
            const result = fn();
            if (result instanceof Promise) {
                return result.catch(async (error) => {
                    if (await this._handleKnownErrorAsync(error, handlers)) {
                        this.controller?.abort();
                        return;
                    }
                    if (handlers?.Any) {
                        await handlers.Any(error as Error);
                        this.controller?.abort();
                        return;
                    }
                    throw error;
                }) as any;
            }
            return result as any;
        } catch (error) {
            if (this._handleKnownError(error, handlers)) {
                this.controller?.abort();
                return undefined as any;
            }

            if (handlers?.Any) {
                handlers.Any(error as Error);
                this.controller?.abort();
                return undefined as any;
            }

            throw error;
        }
    }

    private _handleKnownError(
        error: unknown,
        handlers?: any // don't care
    ): boolean {
        if (!(this.errors && handlers)) {
            return false;
        }

        for (const key in this.errors) {
            if (Object.hasOwn(this.errors, key)) {
                const ErrorConstructor = this.errors[key] as TaggedErrorConsructor;
                if (error instanceof ErrorConstructor && handlers[key]) {
                    handlers[key]?.(error as InstanceType<typeof ErrorConstructor>);
                    return true;
                }
            }
        }

        for (const serviceKey in this.services) {
            const service = this.services[serviceKey];
            if (service && service.errors) {
                for (const errKey in service.errors) {
                    const ErrorConstructor = service.errors[errKey] as { new(...args: any[]): Error };
                    if (ErrorConstructor && error instanceof ErrorConstructor && handlers && (handlers as any)[errKey]) {
                        (handlers as any)[errKey](error);
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private async _handleKnownErrorAsync(
        error: unknown,
        handlers?: any // don't care
    ): Promise<boolean> {
        if (!(this.errors && handlers)) {
            return false;
        }

        for (const key in this.errors) {
            if (Object.hasOwn(this.errors, key)) {
                const ErrorConstructor = this.errors[key] as TaggedErrorConsructor;
                if (error instanceof ErrorConstructor && handlers[key]) {
                    await handlers[key]?.(error as InstanceType<typeof ErrorConstructor>);
                    return true;
                }
            }
        }

        for (const serviceKey in this.services) {
            const service = this.services[serviceKey];
            if (service && service.errors) {
                for (const errKey in service.errors) {
                    const ErrorConstructor = service.errors[errKey] as { new(...args: any[]): Error };
                    if (ErrorConstructor && error instanceof ErrorConstructor && handlers && (handlers as any)[errKey]) {
                        await (handlers as any)[errKey](error);
                        return true;
                    }
                }
            }
        }
        return false;
    }

    static create<
        Features extends Record<string, any> = {},
        ErrorsList extends TaggedErrorConsructor[] = [],
        Services extends Record<string, IService> = Record<string, IService>
    >(requirements: { features: Features, errors: ErrorsList, services: Services }) {
        type Errors = ExtractErrorMap<ErrorsList>;

        const O = {
            C: class GeneratedContext extends Context<{
                Features: Features;
                Errors: Errors;
                Services: Services;
            }> {
                static _Features: Features;
                static _Errors: Errors;
                static _Services: Services;
                static _ErrorsList: ErrorsList;
                constructor(definition: { features?: Features, errors?: Errors, services?: Services }) {
                    super({
                        features: (definition.features || {}) as Features,
                        errors: requirements.errors.reduce((acc, ErrorConstructor) => {
                            const err = new ErrorConstructor();
                            const tag = (err._tag || err.name) as keyof Errors;
                            if (!tag) {
                                throw new Error(`Error constructor ${ErrorConstructor.name} does not have a _tag property.`);
                            }
                            (acc as Record<string, TaggedErrorConsructor>)[tag as string] = ErrorConstructor;
                            return acc;
                        }, {} as Errors),
                        services: definition.services as Services
                    });
                }
            }
        }
        O.C._Features = undefined as unknown as Features;
        O.C._Errors = undefined as unknown as Errors;
        return O.C;
    }

    static merge<T extends Array<{ new(...args: any[]): any; _Features: any; _Errors: any; _Services: any }>>(
        ..._contexts: T
    ) {
        type Features = FlattenUnion<T[number]['_Features']>;
        type Errors = FlattenUnion<T[number]['_Errors']>;
        type Services = FlattenUnion<T[number]['_Services']>;

        class MergedContext extends Context<{
            Features: Features;
            Errors: Errors;
            Services: Services;
        }> {
            static _Features: Features;
            static _Errors: Errors;
            static _Services: Services;

            constructor(definition: { features: Features; errors: Errors, services: Services }) {
                super({
                    features: definition.features,
                    errors: definition.errors,
                    services: definition.services
                });
            }
        }

        MergedContext._Features = undefined as unknown as Features;
        MergedContext._Errors = undefined as unknown as Errors;

        return MergedContext;
    }

}