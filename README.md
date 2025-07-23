# Explicit primitives
> attempt at readable typed primitives for Typescript.   
> Draft: Ongoing document

## You like Effect?
Like any good developer I've been following the trend around a tool like **Effect** (like **fp-ts**) which advocate for full-type safety accross a composable toolkit.  

The main attractive primitives that it offers are:
- typed controled flow
- typed errors
- typed dependency injection

While I love the promise - and have had my time in the fp paradigme - I just hate it. Yes it is cool. Yes you can do plenty in concise way (maybe?). But at what cost?

- steep learning curve & readability concerns
  - requires fp concepts
  - heaving use of unboxing/boxing
  - custom pipeline DSL
- complexity / verbosity
  - every step feels over-engineered
- too many concepts to grasp
  - effect, layer, live layer, services, programs,..
- uncommon patterns
  - heavy use of generator functions
  - (cool) tricks that don't read well
- team work
  - no way I wish to onboard anyone new to it

Also again, what it gives is **beautiful**. A sense of control all-the-way.

## Being explicit
> **Explicit:** fully revealed or expressed without vagueness, implication, or ambiguity : leaving no question as to meaning or intent.

I suppose we all expect our programs to be that way. While following standards we've all tried to re-invent the wheel to *find-a-better-way*.

Last weekend I've spent some time rethinking the need for primitives and how these could exist without what frustrates me in existing solutions.

Maybe:
- we don't need functional programming
- primitives definitions can remain readable
- *most of* what we need is just 3 primitives away

## Primitives
### 1. Context
Typing requirements / available features
```ts
/**
 * Context primitive definition
 * (slightly simplified)
 */ 
type ContextRequirements = KV<Error | Service | unknown>
type Context<Requirements extends ContextRequirements = ContextRequirements> = Requirements

/**
 * Considering a calculator app
 * explicit the context requirements
 * (anything that you wish to reach for)
 */ 
type CalculatorContext = Context<{
    add: (a: number, b: number) => number;
    divide: (a: number, b: number) => number;
    DivisionByZeroError: Error;
    InvalidOperationError: Error;
}>


/**
 * Later on we may build up the necessary context
 * as simply as doing as follow
 */ 
const CalculatorContext: CalculatorContext = {
    add: (a, b) => a + b,
    divide: (a, b) => a / b, 
    DivisionByZeroError,
    InvalidOperationError,
}

/**
 * Now you may wonder, but hang on 
 * - where are we using those errors?
 * ⤵⤵⤵
 */
```


### 2. Service
Abstract a set of features based on a context
```ts
/**
 * Service primitive definition
 * (simplified with context only)
 */
class Service<Ctx extends Context = Context> {
    protected ctx: Ctx;
    constructor(context: Ctx) {
        this.ctx = context;
    }
}

/**
 * Creating the calculator service
 * (without errors)
 */
class CalculatorService extends Service<CalculatorContext> {
    add: (a:number, b: number) {
        return this.ctx.add(a, b);
    },

    divide: (a: number, b: number) {
        return this.ctx.divide(a, b)
    }
}

/**
 * Instantiating it
 */
const calculator = new CalculatorService(CalculatorContext);

calculator.add(1, 2) // => 3
calculator.divide(5, 2) // => 2.5

/**
 * Could have directly
 * been called as follow
 */
const calculator = new CalculatorService({
    add: (a, b) => a + b,
    divide: (a, b) => a / b, 
    DivisionByZeroError,
    InvalidOperationError,
});


/**
 * Now let's address the elephant in the room
 * A safer implementation of the service
 */
class CalculatorService extends Service<CalculatorContext> {
    add: (a:number, b: number) {
        return this.ctx.add(a, b);
    },

    divide: (a: number, b number) {
        if(b === 0) {
            throw new this.ctx.DivisionByZeroError({ message: "Second argument (b) cannot be zero" });
        }
        
        try {
            return this.ctx.divide(a, b)
        } catch (e) {
            throw new this.ctx.InvalidOperationError(e);
        }
    }
}

/**
 * Re-instantiate it
 */
const calculator = new CalculatorService(CalculatorContext);

calculator.divide(10, 0)
/** 
 * Would then throw:
 * DivisionByZeroError: Second argument (b) cannot be zero
 *      at new (/any/path/:1:1)
 *      at new DivisionByZeroError (/any/path/:12:11)
 */

/**
 * So far so good,
 * but we're not handling errors yet!
 * ⤵⤵⤵
 */

```

### 3. Program
Typed control flow / error handler

```ts
/**
 * Some type helpers
 * (some, slightly simplified for the example)
 */
type Constructor<T = any> = new (...args: any[]) => T;
type ErrorKeys<T> = { [K in keyof T]: T[K] extends Constructor<Error> ? K : never }[keyof T];
type ErrorHandlers<Ctx extends Context> = { [K in (ErrorKeys<Ctx> | 'Any')]?: (err: Error) => void | Promise<void> };

/**
 * Program primitive type definition
 * - ctx: current context
 * - controller/signal: for control flow
 * - catch: for error handling
 */
type ProgramExecute<Ctx extends Context> = (fn: (prog: Program<Ctx>) => any, handlers?: ErrorHandlers<Ctx>) => unknown;
type Program<Ctx extends Context = Context> = {
    ctx: Ctx;
    controller: AbortController;
    get signal(): AbortSignal;
    catch: ProgramExecute<Ctx>;
}

/**
 * Program helpers
 * (everything there is!)
 */
const Program = {
    // wraps the context into a program
    create<Ctx extends Context>(context: Ctx): Program<Ctx> {
        const program: Program<Ctx> = {
            controller: new AbortController(),
            get signal() { return this.controller!.signal; },
            ctx: context,
            tryCatch: () => void 0,
        };

        program.tryCatch = (fn: (prog: Program<Ctx>) => any, handlers?: ErrorHandlers<Ctx>) => {
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
                const result = fn(program);
                return result instanceof Promise ? result.catch(handleError) : result;
            } catch (error: unknown) {
                return handleError(error);
            }
        };

        return program;
    },
    // define a function using a context (from type)
    prepare<Ctx extends Context, Fn extends (prog: Program<Ctx>) => any = (prog: Program<Ctx>) => any>(fn: Fn, handlers?: ErrorHandlers<Ctx>) {
        const program = Program.create<Ctx>({} as Ctx);

        return {
            // use any context implementation onto your program
            run: (ctx: Ctx) => {
                program.ctx = ctx;
                return program.tryCatch(fn, handlers);
            },
        }
    },
};

/**
 * Let's start using it
 */
type MainContext = Context<{ calculatorService: CalculatorService }>;
// Notice: a context can be composed of anything, a service too

const mainProgram = Program.prepare<MainContext>((prog) => {
    return prog.calculatorService.divide(5, 2);
});

const result = mainProgram.run({ calculatorService });
// => 2.5

/**
 * Let's catch errors
 */
const mainProgram = Program.prepare<MainContext>(
    ({ ctx }) => ctx.calculatorService.divide(5, 0), 
    {
        DivisionByZeroError(err) {
            console.log(`Handled DivisionByZeroError: ${err.message}`)
        },
        InvalidOperationError(err) {
            console.log(`Handled InvalidOperationError: ${err.message}`)
        },
    }
);

const result = mainProgram.run({ calculatorService });
// LOG: Handled DivisionByZeroError: Second argument (b) cannot be zero
// => undefined

/**
 * What happened?
 * We've safely captured errors at a higher level
 * originating from the shared service.
 */

/**
 * What can this "program" be?
 * Well just a function.
 */
const safelyDivide = (a: number, b: number) => Program.prepare<MainContext>(
    ({ ctx }) => ctx.calculatorService.divide(a, b), 
    {
        DivisionByZeroError(err) {
            console.log(`Handled DivisionByZeroError: ${err.message}`)
        },
        InvalidOperationError(err) {
            console.log(`Handled InvalidOperationError: ${err.message}`)
        },
    }
);

const result = safelyDivide(5, 10).run({ calculatorService });
// => 0.5

/**
 * Showing a few other possibilities
 */
const safelyDivide = (a: number, b: number) => Program.prepare<MainContext>(
    ({ ctx, tryCatch }) => {

        return tryCatch(({ signal }) => {
            throw new ctx.InvalidOperationError({ message: 'Unexpected' });
            return ctx.calculatorService.divide(a, b);
        },
        {
            DivisionByZeroError(err) {
                console.log(`Handled DivisionByZeroError: ${err.message}`)
            },
            InvalidOperationError(err) {
                console.log(`Handled InvalidOperationError: ${err.message}`)
            },
        });

    }
); 
// Notice: the prepare() method has the same signature as the tryCatch()

const result = safelyDivide(5, 10).run({ calculatorService });
// LOG: InvalidOperationError: Unexpected
// => undefined
```

### Sum up
We can:
- **set up typed context**      
for requirements which can be of any type, including Error, Service or Program 
- **set up abstracted services**        
which encapsulate logic through a class based on a Context (and in reality: a Program)
- **set up a program**        
which encapsulate a function call with access to a provided context


## How explicit can it be?

I'll elaborate later.   
For now, [check out the <100 LOC](./index.ts).
