import { Context } from "../context";
import { TaggedError } from "../error";
import { Service } from "../service";

export class FetchNetworkError extends TaggedError('FetchNetworkError') { }
export class FetchParseError extends TaggedError('FetchParseError') { }

export class FetchContext extends Context.create({
    features: {} as { fetch: (url: string, init?: RequestInit) => Promise<Response> },
    errors: [FetchNetworkError, FetchParseError],
    services: {},
}) {
}

export const fetchContext = new FetchContext({
    features: { fetch },
    errors: {
        FetchNetworkError,
        FetchParseError,
    }
});

export class FetchService extends Service.create<FetchContext>() {
    async fetch(url: string, init?: RequestInit) {
        let response: Response;
        try {
            response = await this.use.fetch(url, init);
        } catch (error) {
            throw new this.use.FetchNetworkError({
                message: "Network request failed",
                parent: error
            });
        }

        if (!response.ok) {
            throw new this.use.FetchNetworkError({
                message: `HTTP error: ${response.status}`
            });
        }

        try {
            return await response.json();
        } catch (error) {
            throw new this.use.FetchParseError({
                message: "Failed to parse JSON",
                parent: error
            });
        }
    }
}


export const fetchService = new FetchService(fetchContext);