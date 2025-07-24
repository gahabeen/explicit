import { Data, Program, Service } from "../..";

/**
 * This is an example replicating the Effect by Example
 * https://effectbyexample.com/non-effect-interop
 */

// https://effectbyexample.com/non-effect-interop#consuming-non-effect-code-in-effect
console.log("# Consuming non-effect code in Effect");
console.log(`-> Sync`)
{
    function doThing() {
        return "Hello World";
    }

    class DoThingError extends Data.NamedError("DoThingError")<{
        message: string;
        cause: unknown;
    }> { }

    const main = Program
        .prepare(doThing)
        .catch({
            Any: (err) => {
                throw new DoThingError({ message: "Failed to do thing", cause: err });
            }
        });

    console.log(main.run());
}

console.log(`-> Async`)
{
    async function doAsyncThing() {
        return "Hello World";
    }

    class DoThingError extends Data.NamedError("DoThingError")<{
        message: string;
        cause: unknown;
    }> { }

    const main = Program
        .prepare(doAsyncThing)
        .catch({
            Any: (err) => {
                throw new DoThingError({ message: "Failed to do thing", cause: err });
            }
        });

    console.log(await main.run());
}


// https://effectbyexample.com/non-effect-interop#consuming-effect-code-in-non-effect-code
console.log("# Consuming Effect code in non-effect code");
console.log(`-> Start`)
{
    class FooService extends Service<{ number: number }> {
        acquire() { console.log("constructing FooService") }
        dispose() { console.log("destructing FooService") }
        number() {
            return this.prog.ctx.number;
        }
    }

    const program = Program.prepare<{ foo: FooService }>(async ({ ctx }) => {
        return ctx.foo.number() * 2;
    });

    using fooService = new FooService({ number: 10 });

    async function nonEffectCode() {
        const result = await program.run({ foo: fooService });
        console.log("result", result);
    }

    await nonEffectCode();
}

// https://effectbyexample.com/non-effect-interop#managed-runtime
console.log(`-> Managed Runtime`)
{
    class FooService extends Service<{ number: number }> {
        acquire() { console.log("constructing FooService") }
        dispose() { console.log("destructing FooService") }

        number() {
            return this.prog.ctx.number;
        }

        static default() {
            return new FooService({ number: 10 });
        }
    }

    const program = Program.prepare<{ foo: FooService }>(async ({ ctx }) => {
        return ctx.foo.number() * 2;
    });

    using foo = new FooService({ number: 10 });

    async function nonEffectCodeDefaultRuntime() {
        const result = await program.run({ foo });
        console.log("result", result);
    }

    console.log("--- no managed runtime ---");
    await nonEffectCodeDefaultRuntime();
    await nonEffectCodeDefaultRuntime();

    foo.dispose(); // manually dispose

    using managedRuntime = Service.use({ foo: FooService.default() });

    async function nonEffectCodeManagedRuntime() {
        const result = await program.run(managedRuntime);
        console.log("result", result);
    }

    console.log("--- with managed runtime ---");
    await nonEffectCodeManagedRuntime();
    await nonEffectCodeManagedRuntime();
}


// https://effectbyexample.com/non-effect-interop#running-effects-in-non-effect-code-callbacks
console.log(`-> Running Effects in non-effect code callbacks`)
{
    class FooService extends Service {
        number() { return 10 };
    }

    const logFoo = Program.prepare<{ foo: FooService }>(({ ctx }) => {
        const foo = ctx.foo.number();
        console.log(`foo: ${foo}`);
    })


    async function nonEffectCodeWithCallback(onDone: (result: string) => void) {
        await new Promise((res) => setTimeout(res, 1000));
        console.log("non effect code running callback");
        onDone("done");
    }

    const onDone = (result: string) => {
        logFoo.run({ foo: new FooService() });
    };

    nonEffectCodeWithCallback(onDone)
}