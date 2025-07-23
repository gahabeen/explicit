import { Context, TaggedError } from "../index";
import { FetchService, fetchService } from "../src/features/fetch";

export class ItchError extends TaggedError('Itch')<{ balance: number }> { }
export class DamnError extends TaggedError('Damn') { }

// ---

class HelloContext extends Context.create({
    features: {} as {
        format: (name: string) => string,
    },
    errors: [ItchError],
    services: {},
}) { }

class MainContext extends Context.create({
    features: {},
    errors: [DamnError],
    services: {} as { fetchService: FetchService },
}) { };


class ProgramContext extends Context.merge(HelloContext, MainContext) { }

const programContext = new ProgramContext({
    features: {
        format: (name: string) => `Hello, ${name}!`,
    },
    errors: {
        Itch: ItchError,
        Damn: DamnError,
    },
    services: { fetchService }
});


const hello = (ctx: HelloContext, opt: { name: string }) => {
    return ctx.catch(() => {
        if (!opt.name) {
            throw new ctx.errors.Itch();
        }
        return ctx.use.format(opt.name);
    });
}

const main = (ctx: ProgramContext, name: string) => {
    return ctx.catch(
        async () => {
            const formatted = hello(ctx, { name });
            console.log('Done formatting:', formatted);


            const result = await ctx.use.fetchService.fetch('https://jsonplaceholder.typicde.com/todos/1')

            return result;
        },
        {
            Itch: async () => console.error('Itch error!'),
            FetchParseError: async (error: any) => {
                console.error('Failed to parse JSON:', error.message);
            },
            FetchNetworkError: async (error: any) => {
                console.error('Network error:', error.message);
            },
            Any: async (error: any) => {
                console.error('An error occurred:', error.name);
            }
        }
    );
};


const ok = await main(programContext.init(), 'World');
console.log(ok); // Hello, World!