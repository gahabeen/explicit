import { type Context, Program, Service, TaggedError } from "../..";

// dummy example, playing around

class FetchSpecificError extends TaggedError.create("FetchSpecificError") { }
type FetchContext = Context<
    { fetch: (url: string, options?: RequestInit) => Promise<Response>; },
    [FetchSpecificError]
>;

class FetchService extends Service<FetchContext> {
    async fetch(url: string, options?: RequestInit): Promise<Response> {
        return await this.prog.ctx.fetch(url, options);
    }
}

class CrashError extends TaggedError.create("CrashError") { }
class NetworkError extends TaggedError.create("NetworkError") { }

type MainContext = Context<{
    hello: (name: string) => Promise<string>;
    fetchService: FetchService,
}, [CrashError, NetworkError]>;

const fetchService = new FetchService({ fetch, FetchSpecificError });

const MainProgram = Program.prepare<MainContext>(async ({ ctx }) => {
    const result = await ctx.hello("World")
    throw new CrashError({ message: "Simulated crash" });
    console.log(result);
}, {
    Any: (err: Error) => {
        console.error("An unexpected error occurred:", err.name);
    }
});

MainProgram.run({
    hello: async (name: string) => `Hello, ${name}!`,
    fetchService,
    CrashError,
    NetworkError,
})