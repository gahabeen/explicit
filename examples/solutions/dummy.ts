import { type Context, Program, Service, Data } from "../..";

// dummy example, playing around

class FetchSpecificError extends Data.NamedError("FetchSpecificError") { }
type FetchContext = Context<
    { fetch: (url: string, options?: RequestInit) => Promise<Response>; },
    [FetchSpecificError]
>;

class FetchService extends Service<FetchContext> {
    async fetch(url: string, options?: RequestInit): Promise<Response> {
        return await this.prog.ctx.fetch(url, options);
    }
}

class CrashError extends Data.NamedError("CrashError") { }
class NetworkError extends Data.NamedError("NetworkError") { }

type MainContext = Context<{
    hello: (name: string) => Promise<string>;
    fetchService: FetchService,
}, [CrashError, NetworkError]>;

const fetchService = new FetchService({ fetch, FetchSpecificError });

const mainProgram = Program.prepare<MainContext>(async ({ ctx }) => {
    const result = await ctx.hello("World")
    throw new CrashError({ message: "Simulated crash" });
    console.log(result);
}, {
    Any: (err: Error) => {
        console.error("An unexpected error occurred:", err.name);
    }
});

mainProgram.run({
    hello: async (name: string) => `Hello, ${name}!`,
    fetchService,
    CrashError,
    NetworkError,
})