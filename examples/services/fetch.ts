import { type Context, Service, TaggedError } from "../..";

// errors
export class FetchNetworkError extends TaggedError.create('FetchNetworkError') { }
export class FetchParseError extends TaggedError.create('FetchParseError') { }

// context
export type FetchContext = Context<{
    fetch: (url: string, init?: RequestInit) => Promise<Response>;
}, [FetchNetworkError, FetchParseError]>;

// service
export class FetchService extends Service<FetchContext> {
    async fetch(url: string, init?: RequestInit) {
        let response: Response;
        try {
            response = await this.prog.ctx.fetch(url, init);
        } catch (error) {
            throw new this.prog.ctx.FetchNetworkError({
                message: "Network request failed",
                parent: error
            });
        }

        if (!response.ok) {
            throw new this.prog.ctx.FetchNetworkError({
                message: `HTTP error: ${response.status}`
            });
        }

        try {
            return await response.json();
        } catch (error) {
            throw new this.prog.ctx.FetchParseError({
                message: "Failed to parse JSON",
                parent: error
            });
        }
    }
}

// factory function for common implementation
export const createFetchService = () => new FetchService({ fetch, FetchNetworkError, FetchParseError });