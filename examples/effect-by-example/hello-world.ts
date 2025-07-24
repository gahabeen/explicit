import { Program } from "../..";

/**
 * This is an example replicating the Effect by Example
 * https://effectbyexample.com/hello-world
 */

const main = Program.prepare(() => {
    console.log("Hello World")
});

main.run();